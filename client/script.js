// Socket.io connection with error handling
const socket = io({
  transports: ['websocket'],
  upgrade: false,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// State management
const chatState = {
  currentUser: null,
  selectedUser: null,
  typingTimeout: null
};

// DOM Elements cache
const elements = {
  login: document.getElementById('login'),
  chat: document.getElementById('chat'),
    accessCode: document.getElementById('access-code'),
  usernameInput: document.getElementById('username-input'),
  joinButton: document.getElementById('join-button'),
  usersList: document.getElementById('users-list'),
  messages: document.getElementById('messages'),
  messageInput: document.getElementById('message-input'),
  sendButton: document.getElementById('send-button'),
  typingIndicator: document.getElementById('typing-indicator')
};

// Initialize the app
function init() {
  setupEventListeners();
  setupSocketEvents();
}

// Event Listeners
function setupEventListeners() {
  elements.accessCode.addEventListener('input', verifyAccessCode);
  elements.joinButton.addEventListener('click', setUsername);
  elements.sendButton.addEventListener('click', sendMessage);
  elements.messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
  elements.messageInput.addEventListener('input', handleTyping);
}

function verifyAccessCode() {
  const CORRECT_CODE = "5920";
  const code = elements.accessCode.value.trim();
  
  elements.accessCode.classList.remove('valid', 'invalid');
  
  if (code === CORRECT_CODE) {
    elements.usernameInput.disabled = false;
    elements.joinButton.disabled = false;
    elements.accessCode.classList.add('valid');
  } else if (code.length >= 4) {
    elements.usernameInput.disabled = true;
    elements.joinButton.disabled = true;
    elements.accessCode.classList.add('invalid');
  }
}
// Socket.io Events
function setupSocketEvents() {
  socket.on('connect', () => {
    console.log('Connected with ID:', socket.id);
  });

  socket.on('disconnect', () => {
    console.log('Disconnected');
  });

  socket.on('update-users', updateUsersList);
  socket.on('update-notifications', updateNotifications);
  socket.on('show-conversation', showConversation);
  socket.on('receive-message', receiveMessage);
  socket.on('typing', showTypingIndicator);
}

// Core Functions
function setUsername() {
  const code = elements.accessCode.value.trim();
  if (code !== "5920") {
    alert("Invalid access code!");
    elements.accessCode.classList.add('invalid');
    return;
  }

  const username = elements.usernameInput.value.trim();
  if (!username) return;

  chatState.currentUser = username;
  socket.emit('set-username', { 
    username,
    accessCode: code 
  });
  elements.login.style.display = 'none';
  elements.chat.style.display = 'block';
}


function sendMessage() {
  const text = elements.messageInput.value.trim();
  if (!text || !chatState.selectedUser) return;

  socket.emit('send-message', {
    to: chatState.selectedUser,
    text
  });
  
  elements.messageInput.value = '';
  scrollMessagesToBottom();
}

function handleTyping() {
  if (!chatState.selectedUser) return;
  
  socket.emit('typing', {
    to: chatState.selectedUser,
    isTyping: true
  });
  
  clearTimeout(chatState.typingTimeout);
  chatState.typingTimeout = setTimeout(() => {
    socket.emit('typing', {
      to: chatState.selectedUser,
      isTyping: false
    });
  }, 1000);
}

function selectUser(user) {
  chatState.selectedUser = user;
  elements.messages.innerHTML = `<h4>Loading chat with ${user}...</h4>`;
  socket.emit('get-conversation', user);
}

// UI Update Functions
function updateUsersList(users) {
  const filteredUsers = users.filter(user => user !== chatState.currentUser);
  
  elements.usersList.innerHTML = filteredUsers.map(user => `
    <li onclick="selectUser('${user}')" class="user-item">
      <span class="username">${user}</span>
      <span class="notification-dot"></span>
    </li>
  `).join('');
}

function updateNotifications(senders) {
  document.querySelectorAll('.user-item').forEach(li => {
    const username = li.querySelector('.username').textContent;
    const dot = li.querySelector('.notification-dot');
    dot.style.display = senders.includes(username) ? 'inline-block' : 'none';
  });
}

function showConversation({ with: withUser, messages }) {
  elements.messages.innerHTML = `<h4>Chat with ${withUser}</h4>`;
  
  messages.forEach(msg => {
    const senderDisplay = msg.from === chatState.currentUser ? 'Me' : msg.from;
    const time = new Date(msg.timestamp).toLocaleTimeString();
    
    elements.messages.innerHTML += `
      <p class="${msg.from === chatState.currentUser ? 'sent' : 'received'}">
        <strong>${senderDisplay}</strong> <small>${time}</small><br>
        ${msg.text}
      </p>`;
  });
  
  scrollMessagesToBottom();
}

function receiveMessage({ from, text }) {
  if (from !== chatState.selectedUser && from !== chatState.currentUser) return;
  
  const senderDisplay = from === chatState.currentUser ? 'Me' : from;
  const messageClass = from === chatState.currentUser ? 'sent' : 'received';
  
  elements.messages.innerHTML += `
    <p class="${messageClass}">
      <strong>${senderDisplay}:</strong> ${text}
    </p>`;
  
  scrollMessagesToBottom();
}

function showTypingIndicator({ from, isTyping }) {
  if (from === chatState.selectedUser) {
    elements.typingIndicator.textContent = isTyping ? `${from} is typing...` : '';
  }
}

// Helper Functions
function scrollMessagesToBottom() {
  elements.messages.scrollTop = elements.messages.scrollHeight;
}

// Initialize the application
document.addEventListener('DOMContentLoaded', init);

// Expose selectUser to global scope for HTML onclick
window.selectUser = selectUser;
