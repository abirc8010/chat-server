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

mongoose.connect(import.meta.env.VITE_MONGODB_URL, {

}).then(() => {
    console.log('Connected to MongoDB');
}).catch((error) => {
    console.error('Error connecting to MongoDB:', error);
});

const userSchema = new mongoose.Schema({
    email: String,
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

const emailToSocketIdMap = new Map();

io.on("connection", async (socket, next) => {
    const email = socket.handshake.auth.email;
    const username = socket.handshake.auth.current_username;
    if (email && username) {
        console.log("User connected:", email, username);
        emailToSocketIdMap.set(email, socket.id);
        console.log(emailToSocketIdMap);
        try {
            let user = await User.findOne({ email: email, username });
            if (!user) {
                const newUser = new User({
                    email: email,
                    username: username,
                    contacts: []
                });
                user = await newUser.save();
            }
        }
        catch (error) {
            console.error('Error storing user in database:', error);
        }
    }
    socket.on("getUsernameByEmail", async (email) => {
        try {
            // Find the user by email
            const user = await User.findOne({ email });
            if (!user) {
                // If user not found, emit an error event or empty response
                socket.emit("usernameByEmail", { error: "User not found" });
                return;
            }
            console.log("getting username by email:", email);
            // Emit the user's username to the client
            socket.emit("usernameByEmail", { username: user.username });
        } catch (error) {
            console.error("Error getting username by email:", error);
            // Emit an error event if there's an error during database query
            socket.emit("usernameByEmail", { error: "Error getting username by email" });
        }
    });

    socket.on("getPicture", async (data) => {
        const email = data.email; // Change to use email instead of username
        try {
            // Find the user by email
            const user = await User.findOne({ email });

            console.log("Getting profile picture for user:", user);
            if (!user) {
                // If user not found, emit an error event or empty response
                socket.emit("Picture", { error: "User not found" });
                return;
            }

            // Emit the user's profile picture to the client
            socket.emit("Picture", { email: email, profilePicture: user.profilePicture, username: user.username });
        } catch (error) {
            console.error("Error getting user profile picture:", error);
            // Emit an error event if there's an error during database query
            socket.emit("Picture", { error: "Error getting user profile picture" });
        }
    });

    socket.on("getUserProfilePicture", async (data) => {
        const email = data.email;
        console.log("Current profile pic:", email);
        try {
            // Find the user by email
            const user = await User.findOne({ email });

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

    socket.on("uploadProfilePicture", async (data) => {
        const email = data.email;
        const fileData = data.fileData; // Base64 encoded image data
        console.log("trigerred");
        try {
            const imageUrl = await uploadProfilePicture(email, fileData);
            console.log('Profile picture uploaded and updated for user:', imageUrl);
            // Update the user's profile picture URL in the database with the Cloudinary URL
            await User.findOneAndUpdate({ email: email }, { profilePicture: imageUrl });

            console.log('Profile picture uploaded and updated for user:', email);
            socket.emit("profilePictureUploaded", { success: true });
        } catch (error) {
            console.error('Error uploading profile picture:', error);
            socket.emit("profilePictureUploaded", { success: false, error: error.message });
        }
    });

    socket.on("getContactList", async (email) => {
        try {
            // Find the user by email
            const user = await User.findOne({ email });

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


    socket.on("getHistory", async (payload) => {
        const email = payload.email;

        try {
            const user = await User.findOne({ email: email });
            if (!user) {
                console.log("User not found:", email);
                return; // Exit early if user not found
            }

            // Iterate through user's contacts and retrieve conversation history for each contact
            for (const contact of user.contacts) {
                const messages = await getConversationHistory(email, contact);
                // Emit history back to the user
                socket.emit("history", { sender: email, receiver: contact, messages });
            }
        } catch (error) {
            console.error('Error retrieving conversation history:', error);
        }
    });

    socket.on("addContact", async (payload) => {
        try {
            console.log("Adding contact:", payload.contactEmail, "for user:", payload.email);
            const receipient = await User.findOne({ email: payload.contactEmail });
          
            if (receipient) {
                // If the user is found, update their contacts
                const updatedUser = await User.findOneAndUpdate(
                    { email: payload.email }, // Find the user by their email
                    { $addToSet: { contacts: payload.contactEmail } }, // Add the contact to the contacts array if not already present
                    { new: true } // Return the updated user document
                );

                socket.emit("success");
            } else {
                // If the user is not found, emit a "failed" event
                console.log("User not found:", payload.email);
                socket.emit("failed");
            }
        } catch (error) {
            console.error('Error adding contact:', error);
            socket.emit("failed");
        }
    });


    socket.on("send privateMessage", async (payload) => {
        const receiverSocketId = emailToSocketIdMap.get(payload.receiver);
        try {
            // Create message data object with sender, receiver, and message attributes
            const messageData = {
                sender: payload.email,
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
        const receiverSocketId = emailToSocketIdMap.get(data.receiver);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit("notifyTyping", data);
        }
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

async function uploadProfilePicture(email, fileData) {
    try {
        // Create a temporary file path
        const tempFilePath = path.join(__dirname, 'temp', `${email}_profile_picture.jpg`);

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
