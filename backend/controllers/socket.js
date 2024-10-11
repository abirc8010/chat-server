import { Server } from "socket.io";
import { Message } from "../models/messages.models.js";
import { User } from "../models/users.models.js";

export const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  const userSocketMap = new Map();

  io.on("connection", (socket) => {
    socket.on("login", (email) => {
      userSocketMap.set(email, socket.id);
    });

    socket.on("addContact", async ({ adderEmail, addedEmail }) => {
      try {
        const adder = await User.findOne({ email: adderEmail });
        const added = await User.findOne({ email: addedEmail });

        if (!adder || !added) {
          return socket.emit("error", "User not found");
        }

        if (!adder.contacts.includes(added._id)) {
          adder.contacts.push(added._id);
        }
        if (!added.contacts.includes(adder._id)) {
          added.contacts.push(adder._id);
        }

        await adder.save();
        await added.save();

        const adderSocketId = userSocketMap.get(adderEmail);
        const addedSocketId = userSocketMap.get(addedEmail);

        if (adderSocketId) {
          io.to(adderSocketId).emit("contactAdded", added);
        }

        if (addedSocketId) {
          io.to(addedSocketId).emit("contactAdded", adder);
        }
      } catch (error) {
        console.error("Error adding contact:", error);
      }
    });

    socket.on("sendMessage", async (messageData) => {
      const { senderEmail, receiverEmail, content, mediaUrl } = messageData;

      try {
        const sender = await User.findOne({ email: senderEmail });
        const receiver = await User.findOne({ email: receiverEmail });
        const newMessage = new Message({
          sender: sender,
          receiver: {
            type: "User",
            id: receiver,
          },
          content,
          mediaUrl,
        });

        const savedMessage = await newMessage.save();
        const senderSocketId = userSocketMap.get(senderEmail);
        const receiverSocketId = userSocketMap.get(receiverEmail);

        if (senderSocketId) {
          io.to(senderSocketId).emit("receiveMessage", savedMessage);
        }

        if (receiverSocketId) {
          io.to(receiverSocketId).emit("receiveMessage", savedMessage);
        }
      } catch (error) {
        console.error("Error saving message:", error);
      }
    });

    socket.on("disconnect", () => {
      userSocketMap.forEach((value, key) => {
        if (value === socket.id) {
          userSocketMap.delete(key);
        }
      });
    });
  });

  return io;
};
