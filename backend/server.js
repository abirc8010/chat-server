require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
    }
});
const mongoose = require('mongoose');
const cloudinary = require('cloudinary').v2;
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

mongoose.connect(process.env.MONGODB_URL, {

}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('Error connecting to MongoDB:', error);
});

const userSchema = new mongoose.Schema({
    username: String,
    contacts: [String],
    profilePicture: {
        type: String,
        default: 'you.webp'
    }
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

    // Inside the connection event handler
    socket.on("getUserProfilePicture", async (data) => {
        const username = data.username;
        console.log("Getting profile picture for user:", username);
        try {
            // Find the user by username
            const user = await User.findOne({ username });

            if (!user) {
                // If user not found, emit an error event or empty response
                socket.emit("userProfilePicture", { error: "User not found" });
                return;
            }

            // Emit the user's profile picture to the client
            socket.emit("userProfilePicture", { profilePicture: user.profilePicture });
        } catch (error) {
            console.error("Error getting user profile picture:", error);
            // Emit an error event if there's an error during database query
            socket.emit("userProfilePicture", { error: "Error getting user profile picture" });
        }
    });

    // Event handler for uploading profile pictures
    socket.on("uploadProfilePicture", async (data) => {
        const username = data.username;
        const fileData = data.fileData; // Base64 encoded image data
          console.log("trigerred");
        try {
            const imageUrl = await uploadProfilePicture(username, fileData);
                 console.log('Profile picture uploaded and updated for user:', imageUrl);
            // Update the user's profile picture URL in the database with the Cloudinary URL
            await User.findOneAndUpdate({ username: username }, { profilePicture: imageUrl });

            console.log('Profile picture uploaded and updated for user:', username);
            socket.emit("profilePictureUploaded", { success: true });
        } catch (error) {
            console.error('Error uploading profile picture:', error);
            socket.emit("profilePictureUploaded", { success: false, error: error.message });
        }
    });


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

async function uploadProfilePicture(username, fileData) {
    try {
        // Create a temporary file path
        const tempFilePath = path.join(__dirname, 'temp', `${username}_profile_picture.jpg`);

        // Write the base64 encoded image data to the temporary file
        await fs.writeFile(tempFilePath, fileData, 'base64');

        // Upload the image to Cloudinary using the file path
        const result = await cloudinary.uploader.upload(tempFilePath, {
            folder: 'profile-pictures', // Optional: specify folder to organize uploads
        });

        // Delete the temporary file
        await fs.unlink(tempFilePath);

        return result.secure_url; // Return the URL of the uploaded image
    } catch (error) {
        console.error('Error uploading profile picture to Cloudinary:', error);
        throw error;
    }
}
