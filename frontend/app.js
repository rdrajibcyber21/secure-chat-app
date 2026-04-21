const API = "http://127.0.0.1:8000";

let currentUser = localStorage.getItem("username");

// 🔐 Check login
if (!currentUser) {
  alert("Please login first");
  window.location.href = "login.html";
}

let socket = null;
let selectedUser = null;
let typingTimeout;

// ✅ CONNECT SOCKET
function connectSocket() {
    try {
      socket = new WebSocket(`ws://127.0.0.1:8000/ws/${currentUser}`);
    } catch (err) {
      console.log("WebSocket creation failed");
      return;
    }
  
    if (!socket) {
      console.log("Socket is null");
      return;
    }
  
    socket.onopen = () => {
      console.log("✅ WebSocket connected");
    };
  
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
  
      if (data.type === "typing") {
        if (selectedUser && data.sender === selectedUser) {
          showTyping();
        }
        return;
      }
  
      if (data.sender === selectedUser) {
        addMessage(data.message, false);
      }
    };
  
    socket.onclose = () => {
      console.log("❌ Disconnected... reconnecting");
  
      setTimeout(() => {
        connectSocket();
      }, 1000);
    };
  
    socket.onerror = (err) => {
      console.log("WebSocket error:", err);
    };
  }

// ✅ LOAD USERS + ONLINE STATUS
async function loadUsers() {
  const usersRes = await fetch(API + "/users");
  const users = await usersRes.json();

  const onlineRes = await fetch(API + "/online");
  const onlineUsers = await onlineRes.json();

  const list = document.getElementById("user-list");
  list.innerHTML = "";

  users.forEach(u => {
    const username = u.username;

    if (username === currentUser) return;

    const isOnline = onlineUsers.includes(username);

    const div = document.createElement("div");

    div.innerHTML = `
      <span class="dot ${isOnline ? "online" : "offline"}"></span>
      ${username}
    `;

    div.onclick = () => selectUser(username);

    list.appendChild(div);
  });
}

// ✅ SELECT USER
function selectUser(username) {
  selectedUser = username;

  document.getElementById("chat-with").innerText =
    "Chat with " + username;

  const chatBox = document.getElementById("chat-box");
  chatBox.innerHTML = "";

  loadMessages(username);

  setTimeout(() => {
    chatBox.scrollTop = chatBox.scrollHeight;
  }, 100);
}

// ✅ LOAD CHAT HISTORY
async function loadMessages(user) {
  const res = await fetch(`${API}/messages/${currentUser}/${user}`);
  const data = await res.json();

  const chatBox = document.getElementById("chat-box");
  chatBox.innerHTML = "";

  data.forEach(msg => {
    const sender = msg[0];
    const text = msg[1];

    const isSent = sender === currentUser;

    addMessage(text, isSent);
  });

  chatBox.scrollTop = chatBox.scrollHeight;
}

// ✅ SEND MESSAGE
function sendMessage() {
  const input = document.getElementById("messageInput");
  const msg = input.value.trim();

  if (!msg || !selectedUser) return;

  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.log("Socket not ready");
    return;
  }

  socket.send(JSON.stringify({
    to: selectedUser,
    message: msg
  }));

  addMessage(msg, true);
  input.value = "";
}

// ✅ SEND TYPING EVENT
function sendTyping() {
    console.log("typing sent"); // 👈 ADD THIS
  
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (!selectedUser) return;
  
    socket.send(JSON.stringify({
      type: "typing",
      to: selectedUser
    }));
  }

// ✅ SHOW TYPING UI
function showTyping() {
  const el = document.getElementById("typing");

  if (!el) return;

  el.innerText = selectedUser + " is typing...";
  el.style.display = "block";

  clearTimeout(typingTimeout);

  typingTimeout = setTimeout(() => {
    el.style.display = "none";
  }, 1500);
}

// ✅ ADD MESSAGE TO UI
function addMessage(text, isSent = false) {
  const chatBox = document.getElementById("chat-box");

  if (typeof text === "object") {
    text = text.message || JSON.stringify(text);
  }

  const div = document.createElement("div");
  div.classList.add("message");
  div.classList.add(isSent ? "sent" : "received");

  const time = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  div.innerHTML = `
    <div>${text}</div>
    <div class="time">${time}</div>
  `;

  chatBox.appendChild(div);

  chatBox.scrollTo({
    top: chatBox.scrollHeight,
    behavior: "smooth"
  });
}

// ✅ LOGOUT
function logout() {
  localStorage.removeItem("username");
  window.location.href = "login.html";
}

// ✅ INIT
window.onload = () => {
  connectSocket();
  loadUsers();

  // refresh online users
  setInterval(loadUsers, 3000);
};