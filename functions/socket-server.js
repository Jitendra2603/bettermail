const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { Server } = require('socket.io');
const cors = require('cors')({ origin: true });

// Initialize Firebase Admin
admin.initializeApp();

// Socket.io server
exports.socket = functions.https.onRequest((request, response) => {
  // Handle CORS preflight requests
  if (request.method === 'OPTIONS') {
    cors(request, response, () => {
      response.status(204).send('');
    });
    return;
  }

  // For WebSocket upgrade requests
  if (request.headers.upgrade === 'websocket') {
    const io = new Server(functions.getServer(), {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true
      }
    });

    // Socket.io connection handler
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      // Authenticate the user
      const token = socket.handshake.auth.token;
      const userId = socket.handshake.auth.userId;
      
      if (!token || !userId) {
        console.error('Authentication failed: Missing token or userId');
        socket.disconnect();
        return;
      }
      
      // Verify the token (in a real implementation)
      // For now, we'll just log it
      console.log('User authenticated:', userId);
      
      // Store user info in socket
      socket.user = { id: userId };
      
      // Handle joining a room
      socket.on('join_room', ({ roomId }) => {
        console.log(`User ${userId} joining room ${roomId}`);
        socket.join(roomId);
        
        // Notify others in the room
        socket.to(roomId).emit('message', {
          type: 'user_joined',
          data: {
            userId,
            roomId,
            timestamp: new Date().toISOString()
          }
        });
      });
      
      // Handle leaving a room
      socket.on('leave_room', ({ roomId }) => {
        console.log(`User ${userId} leaving room ${roomId}`);
        socket.leave(roomId);
        
        // Notify others in the room
        socket.to(roomId).emit('message', {
          type: 'user_left',
          data: {
            userId,
            roomId,
            timestamp: new Date().toISOString()
          }
        });
      });
      
      // Handle messages
      socket.on('message', (message) => {
        console.log('Message received:', message);
        
        // Get the target room from the message
        const roomId = message.data?.chatId;
        
        if (!roomId) {
          console.error('Invalid message: Missing chatId');
          return;
        }
        
        // Store the message in Firestore
        if (message.type === 'chat_message') {
          const { content, sender, timestamp, attachments } = message.data;
          
          admin.firestore().collection('messages').add({
            content,
            sender,
            chatId: roomId,
            userId: socket.user.id,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            attachments: attachments || []
          })
          .then((docRef) => {
            console.log('Message stored with ID:', docRef.id);
            
            // Update the message with the Firestore ID
            message.data.id = docRef.id;
            
            // Broadcast the message to all clients in the room
            io.to(roomId).emit('message', message);
          })
          .catch((error) => {
            console.error('Error storing message:', error);
          });
        } 
        // Handle typing status
        else if (message.type === 'typing_status') {
          // Broadcast typing status to all clients in the room except sender
          socket.to(roomId).emit('message', message);
          
          // Update typing status in Firestore
          const { isTyping } = message.data;
          
          admin.firestore().collection('chats').doc(roomId).update({
            [`typingUsers.${socket.user.id}`]: isTyping 
              ? admin.firestore.FieldValue.serverTimestamp() 
              : null,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          })
          .catch((error) => {
            console.error('Error updating typing status:', error);
          });
        }
        // For other message types, just broadcast
        else {
          socket.to(roomId).emit('message', message);
        }
      });
      
      // Handle disconnection
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
        
        // Update user status in all rooms they were in
        const rooms = Array.from(socket.rooms);
        rooms.forEach(roomId => {
          if (roomId !== socket.id) { // Skip the default room (socket.id)
            socket.to(roomId).emit('message', {
              type: 'user_disconnected',
              data: {
                userId: socket.user?.id,
                roomId,
                timestamp: new Date().toISOString()
              }
            });
          }
        });
      });
    });

    return io.attach(functions.getServer());
  }

  // For non-WebSocket requests
  response.status(426).send('Upgrade Required');
});

// HTTP endpoint to get the WebSocket URL
exports.getSocketUrl = functions.https.onRequest((request, response) => {
  cors(request, response, () => {
    response.json({
      url: `wss://${process.env.GCLOUD_PROJECT}.web.app/socket`
    });
  });
}); 