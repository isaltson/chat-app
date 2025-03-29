const socket = io();
let currentUser;
let selectedUser;

// Debug connection

const socket = io({
  transports: ['websocket'], // Force WebSocket
  upgrade: false
});
socket.on('connect', () => {
  console.log('Connected to server with socket ID:', socket.id);
});

socket.on('disconnect', () => {
  console.log('Disconnected from server');
});

// Set username
function setUsername() {
  const username = document.getElementById('username-input').value.trim();
  if (username) {
    currentUser = username;
    socket.emit('set-username', username);
    console.log('Username set:', username);
    document.getElementById('login').style.display = 'none';
    document.getElementById('chat').style.display = 'block';
  }
}

// Show notifications
socket.on('update-notifications', (senders) => {
  document.querySelectorAll('.user-item').forEach(li => {
    const username = li.querySelector('.username').textContent;
    const dot = li.querySelector('.notification-dot');
    dot.style.display = senders.includes(username) ? 'inline-block' : 'none';
  });
});

// Show conversation history
socket.on('show-conversation', ({ with: withUser, messages }) => {
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = `<h4>Chat with ${withUser}</h4>`;
    messages.forEach(msg => {
      // Show "Me" for your own messages
      const senderDisplay = msg.from === currentUser ? 'Me' : msg.from;

    const time = new Date(msg.timestamp).toLocaleTimeString();
    messagesDiv.innerHTML += `
      <p class="${msg.from === currentUser ? 'sent' : 'received'}">
        <strong>${msg.from}</strong> <small>${time}</small><br>
        ${msg.text}
      </p>`;
  });
  messagesDiv.scrollTop = messagesDiv.scrollHeight;
});  

// Typing detection
const messageInput = document.getElementById('message-input');
let typingTimeout;

messageInput.addEventListener('input', () => {
  if (!selectedUser) return;
  
  socket.emit('typing', { to: selectedUser, isTyping: true });
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit('typing', { to: selectedUser, isTyping: false });
  }, 1000);
});

// Show typing indicator
socket.on('typing', ({ from, isTyping }) => {
  if (from === selectedUser) {
    const typingDiv = document.getElementById('typing-indicator');
    typingDiv.textContent = isTyping ? `${from} is typing...` : '';
  }
});

// Select user to chat with
function selectUser(user) {
  selectedUser = user;
  const messagesDiv = document.getElementById('messages');
  
  // Clear messages and load fresh conversation
  messagesDiv.innerHTML = `<h4>Loading chat with ${user}...</h4>`;
  socket.emit('get-conversation', user);
}

// Send message
function sendMessage() {
  const text = document.getElementById('message-input').value.trim();
  if (text && selectedUser) {
    socket.emit('send-message', { to: selectedUser, text });
    document.getElementById('message-input').value = '';
  }
}

// Receive message
socket.on('receive-message', ({ from, text }) => {
  const messagesDiv = document.getElementById('messages');
  const isCurrentUser = from === currentUser;
  const isActiveChat = from === selectedUser;
  
  if (isCurrentUser || isActiveChat) {
    const senderDisplay = isCurrentUser ? 'Me' : from;
    const messageClass = isCurrentUser ? 'sent' : 'received';
    
    messagesDiv.innerHTML += `
      <p class="${messageClass}">
        <strong>${senderDisplay}:</strong> ${text}
      </p>`;
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
});

// Update online users list
socket.on('update-users', (users) => {
  console.log('Received online users:', users);
  
  // Filter out current user
  const filteredUsers = users.filter(user => user !== currentUser);
  
  const usersList = document.getElementById('users-list');
  usersList.innerHTML = filteredUsers.map(user => 
    `<li onclick="selectUser('${user}')" class="user-item">
      <span class="username">${user}</span>
      <span class="notification-dot"></span>
    </li>`
  ).join('');
});
