import { Server } from "socket.io";
import { Message } from "../models/messages.models.js";
import { User } from "../models/users.models.js";
import { Groups } from "../models/groups.models.js";
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

        const contactObject = (user) => ({
          type: "Private",
          _id: user._id,
          username: user.username,
          email: user.email,
          profilePicture: user.profilePicture,
          status: user.status,
        });

        const adderSocketId = userSocketMap.get(adderEmail);
        const addedSocketId = userSocketMap.get(addedEmail);

        if (adderSocketId) {
          io.to(adderSocketId).emit("contactAdded", contactObject(added));
        }

        if (addedSocketId) {
          io.to(addedSocketId).emit("contactAdded", contactObject(adder));
        }
      } catch (error) {
        console.error("Error adding contact:", error);
      }
    });

    socket.on("createGroup", async (groupData, callback) => {
      const { groupName, admin, members, adminEmail, groupPicture } = groupData;

      try {
        const newGroup = new Groups({
          groupName,
          admin,
          members: [...members.map((member) => member._id), admin],
          groupPicture: groupPicture || "default_group_picture.webp",
        });
        await newGroup.save();
        await User.updateMany(
          { _id: { $in: [...members.map((member) => member._id), admin] } },
          { $push: { groups: newGroup._id } }
        );
        const groupObject = {
          type: "Group",
          _id: newGroup._id,
          groupName: newGroup.groupName,
          email: null,
          groupPicture: newGroup.groupPicture,
        };
        const allMembers = [...members, { _id: admin, email: adminEmail }];
        allMembers.forEach((member) => {
          const memberSocketId = userSocketMap.get(member.email);
          if (memberSocketId) {
            io.to(memberSocketId).emit("contactAdded", groupObject);
          }
        });
        callback({ success: true, group: groupObject });
      } catch (error) {
        console.error("Error creating group:", error);
        callback({ success: false, message: "Error creating group." });
      }
    });

    socket.on("sendMessage", async (messageData) => {
      const {
        senderEmail,
        receiverEmail,
        content,
        mediaUrl,
        groupId,
        replyTo,
      } = messageData;
      console.log("Received message: ", messageData);
      console.log(senderEmail, receiverEmail, content, groupId);
      try {
        const sender = await User.findOne({ email: senderEmail });
        let newMessage;
        let replymessage = null;
        if (replyTo) {
          replymessage = await Message.findById(replyTo);
        }
        if (groupId) {
          const groupMembers = await Groups.findById(groupId).populate(
            "members"
          );
          newMessage = new Message({
            sender: sender,
            receiver: {
              type: "Group",
              id: groupId,
            },
            content,
            mediaUrl,
            replyTo: replymessage
              ? { _id: replymessage._id, content: replymessage.content }
              : null,
          });

          const savedMessage = await newMessage.save();
          console.log("saved message", savedMessage);
          groupMembers.members.forEach((member) => {
            const memberSocketId = userSocketMap.get(member.email);
            if (memberSocketId) {
              io.to(memberSocketId).emit("receiveMessage", savedMessage);
            }
          });
        } else {
          const receiver = await User.findOne({ email: receiverEmail });
          newMessage = new Message({
            sender: sender,
            receiver: {
              type: "User",
              id: receiver,
            },
            content,
            mediaUrl,
            replyTo: replymessage
              ? { _id: replymessage._id, content: replymessage.content }
              : null,
          });

          const savedMessage = await newMessage.save();
          const senderSocketId = userSocketMap.get(senderEmail);
          const receiverSocketId = userSocketMap.get(receiverEmail);
          console.log("Sending message ");
          if (senderSocketId) {
            io.to(senderSocketId).emit("receiveMessage", savedMessage);
          }

          if (receiverSocketId) {
            io.to(receiverSocketId).emit("receiveMessage", savedMessage);
          }
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
