const express = require('express');
const socketIo = require('socket.io');
const http = require('http');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Data structures
const users = new Map();       // username → Set(socketIds)
const conversations = new Map(); // username → { withUser: string, messages: [...] }[]
const notifications = new Map(); // username → Set(senders)

app.use(express.static('client'));

// Helper function to broadcast user list
function broadcastUserList() {
  const userList = Array.from(users.keys());
  io.emit('update-users', userList);
  console.log('Broadcasting user list:', userList);
}

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  // Set username
  socket.on('set-username', (username) => {
    if (!username) return;

    // Initialize user data structures
    if (!users.has(username)) {
      users.set(username, new Set());
      conversations.set(username, []);
      notifications.set(username, new Set());
    }
    
    // Add connection to user
    users.get(username).add(socket.id);
    console.log(`${username} connected (${socket.id})`);
    
    // Broadcast updated user list
    broadcastUserList();
    
    // Send existing notifications
    socket.emit('update-notifications', Array.from(notifications.get(username)));
  });

  // Send message
  // Update send-message handler
socket.on('send-message', ({ to, text }) => {
  const from = [...users.entries()]
    .find(([_, sockets]) => sockets.has(socket.id))?.[0];

  if (!from || !users.has(to)) return;

  // Store messages
  storeMessage(from, to, text, true);  // Sender copy
  storeMessage(to, from, text, false); // Receiver copy

  // Notify both parties
  const notifySockets = [
    ...users.get(from), // Send to sender's all devices
    ...users.get(to)    // Send to receiver's all devices
  ];

  notifySockets.forEach(socketId => {
    io.to(socketId).emit('receive-message', { 
      from: from, 
      text: text 
    });
  });

  // Update notifications
  notifications.get(to).add(from);
  io.to([...users.get(to)]).emit('update-notifications', Array.from(notifications.get(to)));
});
    // Deliver real-time message only if recipient is viewing this chat
    const recipientSockets = users.get(to);
    recipientSockets.forEach(socketId => {
      io.to(socketId).emit('potential-message', { from, text });
    });
 

  // Store message in conversation history
  function storeMessage(user, withUser, text, isSender) {
    let conv = conversations.get(user).find(c => c.withUser === withUser);
    if (!conv) {
      conv = { withUser, messages: [] };
      conversations.get(user).push(conv);
    }
    conv.messages.push({
      from: isSender ? 'you' : withUser,
      text,
      timestamp: new Date(),
      read: isSender
    });
  }
   
  socket.on('typing', ({ to, isTyping }) => {
    const from = [...users.entries()]
      .find(([_, sockets]) => sockets.has(socket.id))?.[0];
    
    if (from && users.has(to)) {
      io.to([...users.get(to)]).emit('typing', { from, isTyping });
    }
  });

  // Get conversation history
  socket.on('get-conversation', (withUser) => {
    const currentUser = [...users.entries()]
      .find(([_, sockets]) => sockets.has(socket.id))?.[0];
    
    if (!currentUser) return;

    // Find or create conversation
    let conv = conversations.get(currentUser).find(c => c.withUser === withUser);
    if (!conv) {
      conv = { withUser, messages: [] };
      conversations.get(currentUser).push(conv);
    }

    // Mark messages as read
    conv.messages.forEach(msg => {
      if (msg.from === withUser) msg.read = true;
    });

    // Clear notifications
    notifications.get(currentUser).delete(withUser);
    io.to([...users.get(currentUser)]).emit('update-notifications', Array.from(notifications.get(currentUser)));

    socket.emit('show-conversation', { 
      with: withUser, 
      messages: conv.messages.map(msg => ({
        ...msg,
        from: msg.from === 'you' ? currentUser : msg.from
      }))
    });
  });

  // Cleanup on disconnect
  socket.on('disconnect', () => {
    const userEntry = [...users.entries()]
      .find(([_, sockets]) => sockets.has(socket.id));
    
    if (userEntry) {
      const [username, sockets] = userEntry;
      sockets.delete(socket.id);
      console.log(`${username} disconnected (${socket.id})`);

      // Remove user data when last connection closes
      if (sockets.size === 0) {
        users.delete(username);
        conversations.delete(username);
        notifications.delete(username);
      }

      // Broadcast updated user list
      broadcastUserList();
    }
  });
});

server.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});