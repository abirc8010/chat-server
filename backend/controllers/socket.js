import { Server } from 'socket.io';
import { Message } from '../models/messages.models.js';
import { User } from '../models/users.models.js';

export const initializeSocket = (server) => {
    const io = new Server(server, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });

    const userSocketMap = new Map();

    io.on('connection', (socket) => {

        socket.on('login', (email) => {
            userSocketMap.set(email, socket.id);
            console.log(`User registered: ${email} with socket ID: ${socket.id}`);
        });

        socket.on('sendMessage', async (messageData) => {
            const { senderEmail, receiverEmail, content } = messageData;
            console.log('Message received:', messageData);

            try {
                const sender = await User.findOne({ email: senderEmail });
                const receiver = await User.findOne({ email: receiverEmail });
                const newMessage = new Message({
                    sender: sender,
                    receiver: {
                        type: 'User',
                        id: receiver,
                    },
                    content,
                });

                const savedMessage = await newMessage.save();
                const senderSocketId = userSocketMap.get(senderEmail);
                const receiverSocketId = userSocketMap.get(receiverEmail);
                if (senderSocketId) {
                    io.to(senderSocketId).emit('receiveMessage', savedMessage);
                }

                if (receiverSocketId) {
                    io.to(receiverSocketId).emit('receiveMessage', savedMessage);
                }

            } catch (error) {
                console.error('Error saving message:', error);
            }
        });

        socket.on('disconnect', () => {
            userSocketMap.forEach((value, key) => {
                if (value === socket.id) {
                    userSocketMap.delete(key);
                }
            });
        });
    });

    return io;
};
