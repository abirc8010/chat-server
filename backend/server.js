require('dotenv').config();
const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
    }
});
const mongoose = require('mongoose');
const { type } = require('os');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URL, {

}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('Error connecting to MongoDB:', error);
});

const userSchema = new mongoose.Schema({
    username: String,
    contacts: [String]
});

const messageSchema = new mongoose.Schema({
    sender: String,
    receiver: String,
    message: String,
    timestamp: {
        type: Date,
        default: Date.now
    },
    url: {
        type: String,
        default: null
    },
    reply: {
        type: Object,
        default: null
    },
    Time: {
       type: String,
       default: null
    }
});

// Creating User and Message models
const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

const usernameToSocketIdMap = new Map();

io.on("connection", async (socket, next) => {
    const username = socket.handshake.auth.username;
    console.log("User connected", username);
    usernameToSocketIdMap.set(username, socket.id);
    console.log(usernameToSocketIdMap);
    // Server-side: Listen for "getContactList" event
    socket.on("getContactList", async (username) => {
        try {
            // Find the user by username
            const user = await User.findOne({ username });

            if (!user) {
                // If user not found, emit an error event or empty list
                socket.emit("contactList", { error: "User not found", contacts: [] });
                return;
            }

            // Emit the user's contact list back to the client
            socket.emit("contactList", { contacts: user.contacts });
        } catch (error) {
            console.error("Error getting contact list:", error);
            // Emit an error event if there's an error during database query
            socket.emit("contactList", { error: "Error getting contact list", contacts: [] });
        }
    });

    // Storing user in the database if not already present
    try {
        let user = await User.findOne({ username: username });
        if (!user) {
            const newUser = new User({
                username: username,
                contacts: []
            });
            user = await newUser.save();
        }
    }
    catch (error) {
        console.error('Error storing user in database:', error);
    }

    socket.on("getHistory", async (payload) => {
        const username = payload.username;

        try {
            const user = await User.findOne({ username: username });
            if (!user) {
                console.log("User not found:", username);
                return; // Exit early if user not found
            }

            // Iterate through user's contacts and retrieve conversation history for each contact
            for (const contact of user.contacts) {
                const messages = await getConversationHistory(username, contact);
                // Emit history back to the user
                socket.emit("history", { sender: username, receiver: contact, messages });
            }
        } catch (error) {
            console.error('Error retrieving conversation history:', error);
        }
    });
    // Inside the socket.io connection event handler
    socket.on("addContact", async (payload) => {
        try {
            console.log("Adding contact:", payload.contactUsername, "for user:", payload.username);
            const user = await User.findOneAndUpdate(
                { username: payload.username }, // Find the user by their username
                { $addToSet: { contacts: payload.contactUsername } }, // Add the contact to the contacts array if not already present
                { new: true } // Return the updated user document
            );

            if (user) {
                console.log("Contact added successfully. Updated user:", user);
            } else {
                console.log("User not found:", payload.username);
            }
        } catch (error) {
            console.error('Error adding contact:', error);
        }
    });


    socket.on("private message", async (payload) => {
        const receiverSocketId = usernameToSocketIdMap.get(payload.receiver);
        try {
            // Create message data object with sender, receiver, and message attributes
            const messageData = {
                sender: payload.username,
                receiver: payload.receiver,
                message: payload.message,
                Time: payload.Time,
                url: payload.url || null,
                reply: payload.reply || null
            };
            const message = new Message(messageData);

            // Save the message to MongoDB
            await message.save();

            // Emit message to recipient
            if (receiverSocketId) {
                socket.to(receiverSocketId).emit("private message", payload);
                console.log("private message emitted to", payload.receiver);
            } else {
                console.log("Receiver not found:", payload.receiver);
            }
        } catch (error) {
            console.error('Error saving or emitting message:', error);
        }
    });

    socket.on("chat", (payload) => {
        io.emit("chat", payload);
    });

    socket.on("typing", (data) => {
        socket.broadcast.emit("notifyTyping", data);
    });

    socket.on("disconnect", () => {
        console.log("User disconnected");
    });

    socket.on("stopTyping", () => {
        socket.broadcast.emit("notifyStopTyping");
    });
});

server.listen(5000, () => {
    console.log("server is listening to port 5000 ...");
});

// Function to retrieve conversation history between two users
async function getConversationHistory(sender, receiver) {
    try {
        // Query the messages collection for messages between the sender and receiver
        const messages = await Message.find({
            $or: [
                { sender: sender, receiver: receiver },
                { sender: receiver, receiver: sender }
            ]
        }).sort({ timestamp: 1 }); // Sort by timestamp in ascending order

        return messages;
    } catch (error) {
        console.error('Error retrieving conversation history:', error);
        return [];
    }
}
