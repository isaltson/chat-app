const express = require('express');
const socketIo = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with production/development config
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://chat-app-9xnr.onrender.com'] 
      : ['http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

// Data structures
const users = new Map();          // username → Set(socketIds)
const conversations = new Map();  // username → { withUser: string, messages: [...] }[]
const notifications = new Map();  // username → Set(senders)

// Middleware
app.use(express.static('client'));

// Helper functions
function broadcastUserList() {
  const userList = Array.from(users.keys());
  io.emit('update-users', userList);
}

function storeMessage(user, withUser, text, isSender) {
  let conversation = conversations.get(user).find(c => c.withUser === withUser);
  if (!conversation) {
    conversation = { withUser, messages: [] };
    conversations.get(user).push(conversation);
  }
  conversation.messages.push({
    from: isSender ? 'you' : withUser,
    text,
    timestamp: new Date(),
    read: isSender
  });
}

// Socket.io connection handler
io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Set username
  socket.on('set-username', (username) => {
    if (!username) return;

    // Initialize user data
    if (!users.has(username)) {
      users.set(username, new Set());
      conversations.set(username, []);
      notifications.set(username, new Set());
    }

    users.get(username).add(socket.id);
    console.log(`${username} connected (${socket.id})`);
    
    broadcastUserList();
    socket.emit('update-notifications', Array.from(notifications.get(username)));
  });

  // Handle messages
  socket.on('send-message', ({ to, text }) => {
    const from = [...users.entries()].find(([_, sockets]) => sockets.has(socket.id))?.[0];
    if (!from || !users.has(to)) return;

    console.log(`Message from ${from} to ${to}: ${text}`);

    // Store messages for both parties
    storeMessage(from, to, text, true);
    storeMessage(to, from, text, false);

    // Add notification
    notifications.get(to).add(from);
    io.to([...users.get(to)]).emit('update-notifications', Array.from(notifications.get(to)));

    // Deliver message to all connected devices of both users
    const allRecipients = new Set([...users.get(from), ...users.get(to)]);
    allRecipients.forEach(socketId => {
      io.to(socketId).emit('receive-message', { 
        from, 
        text,
        isCurrentUser: socketId === socket.id
      });
    });
  });

  // Get conversation history
  socket.on('get-conversation', (withUser) => {
    const currentUser = [...users.entries()].find(([_, sockets]) => sockets.has(socket.id))?.[0];
    if (!currentUser) return;

    const conversation = conversations.get(currentUser).find(c => c.withUser === withUser) || 
                        { withUser, messages: [] };

    // Mark messages as read
    conversation.messages.forEach(msg => {
      if (msg.from === withUser) msg.read = true;
    });

    // Clear notification
    notifications.get(currentUser).delete(withUser);
    io.to([...users.get(currentUser)]).emit('update-notifications', Array.from(notifications.get(currentUser)));

    socket.emit('show-conversation', {
      with: withUser,
      messages: conversation.messages.map(msg => ({
        ...msg,
        from: msg.from === 'you' ? currentUser : msg.from
      }))
    });
  });

  // Typing indicator
  socket.on('typing', ({ to, isTyping }) => {
    const from = [...users.entries()].find(([_, sockets]) => sockets.has(socket.id))?.[0];
    if (from && users.has(to)) {
      io.to([...users.get(to)]).emit('typing', { from, isTyping });
    }
  });

  // Disconnect handler
  socket.on('disconnect', () => {
    const userEntry = [...users.entries()].find(([_, sockets]) => sockets.has(socket.id));
    if (!userEntry) return;

    const [username, sockets] = userEntry;
    sockets.delete(socket.id);
    console.log(`${username} disconnected (${socket.id})`);

    if (sockets.size === 0) {
      users.delete(username);
      conversations.delete(username);
      notifications.delete(username);
    }

    broadcastUserList();
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
