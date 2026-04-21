from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import sqlite3
import json

app = FastAPI()

# ✅ CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ✅ DATABASE
conn = sqlite3.connect("chat.db", check_same_thread=False)
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sender TEXT,
    receiver TEXT,
    message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
""")

conn.commit()

# ✅ USER MODEL
class User(BaseModel):
    username: str
    password: str

# ✅ CONNECTION MANAGER
class ConnectionManager:
    def __init__(self):
        self.active_connections = {}

    async def connect(self, username, websocket):
        await websocket.accept()
        self.active_connections[username] = websocket

    def disconnect(self, username):
        self.active_connections.pop(username, None)

    async def send_private(self, sender, receiver, message):
        # save message
        cursor.execute(
            "INSERT INTO messages (sender, receiver, message) VALUES (?, ?, ?)",
            (sender, receiver, message),
        )
        conn.commit()

        data = json.dumps({
            "sender": sender,
            "message": message
        })

        # send to receiver
        if receiver in self.active_connections:
            await self.active_connections[receiver].send_text(data)

        # send back to sender
        if sender in self.active_connections:
            await self.active_connections[sender].send_text(data)

# ✅ CREATE MANAGER
manager = ConnectionManager()

# ✅ AUTH
@app.post("/register")
async def register(data: User):
    try:
        cursor.execute(
            "INSERT INTO users (username, password) VALUES (?, ?)",
            (data.username, data.password)
        )
        conn.commit()
        return {"message": "Registered"}
    except:
        return {"error": "User exists"}

@app.post("/login")
def login(user: User):
    cursor.execute(
        "SELECT * FROM users WHERE username=? AND password=?",
        (user.username, user.password)
    )
    result = cursor.fetchone()

    if result:
        return {"message": "Login successful"}
    else:
        raise HTTPException(status_code=400, detail="Invalid credentials")

# ✅ USERS
@app.get("/users")
def get_users():
    cursor.execute("SELECT username FROM users")
    return [{"username": u[0]} for u in cursor.fetchall()]

@app.get("/online")
def get_online():
    return list(manager.active_connections.keys())

# ✅ CHAT HISTORY
@app.get("/messages/{u1}/{u2}")
def get_messages(u1: str, u2: str):
    cursor.execute("""
    SELECT sender, message FROM messages
    WHERE (sender=? AND receiver=?) OR (sender=? AND receiver=?)
    ORDER BY id ASC
    """, (u1, u2, u2, u1))
    return cursor.fetchall()

# ✅ WEBSOCKET
@app.websocket("/ws/{username}")
async def websocket_endpoint(websocket: WebSocket, username: str):
    await manager.connect(username, websocket)

    try:
        while True:
            data = await websocket.receive_text()
            parsed = json.loads(data)

            # 🔥 HANDLE TYPING EVENT
            if parsed.get("type") == "typing":
                receiver = parsed["to"]

                if receiver in manager.active_connections:
                    await manager.active_connections[receiver].send_text(json.dumps({
                        "type": "typing",
                        "sender": username
                    }))
                continue

            # NORMAL MESSAGE
            await manager.send_private(
                sender=username,
                receiver=parsed["to"],
                message=parsed["message"]
            )

    except WebSocketDisconnect:
        manager.disconnect(username)