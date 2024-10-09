
import { Server } from 'socket.io';

export const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: '*', 
            methods: ['GET', 'POST'],
        },
    });

    io.on('connection', (socket) => {
        console.log('A user connected:', socket.id);

        socket.on('userOnline', (userId) => {
            socket.userId = userId; 
            socket.broadcast.emit('userStatus', { userId, online: true });
        });

        socket.on('disconnect', () => {
            console.log('A user disconnected:', socket.id);
            socket.broadcast.emit('userStatus', { userId: socket.userId, online: false });
        });

        socket.on('sendMessage', (messageData) => {
            const { recipientId, message } = messageData;
            socket.to(recipientId).emit('receiveMessage', message);
        });
        socket.on('addContact', (contactData) => {
            const { userId, newContact } = contactData;
            socket.emit('contactAdded', newContact); 
            socket.broadcast.emit('newContact', newContact); 
        });
    });

    return io;
};
