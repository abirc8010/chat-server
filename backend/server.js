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

const groupSchema = new mongoose.Schema({
    groupName: String,
    groupPicture: {
        type: String,
        default: 'you.webp'
    },
    admin: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User' // Reference to the User schema
    },
    members: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }]
});
const userSchema = new mongoose.Schema({
    email: String,
    username: String,
    uid: {
        type: String,
        default: null
    },
    contacts: [String],
    profilePicture: {
        type: String,
        default: 'you.webp'
    },
    groups: {
        type: [groupSchema],
        default: null
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
    name: {
        type: String,
        default: null
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
    },
    type: {
        type: String,
        enum: ['private', 'group'],
        default: 'private'
    }
});

// Creating User and Message models
const User = mongoose.model('User', userSchema);
const Message = mongoose.model('Message', messageSchema);

const Group = mongoose.model('Group', groupSchema);
const emailToSocketIdMap = new Map();
const onlineUsers = new Set();
io.on("connection", async (socket, next) => {
    const email = socket.handshake.auth.email;
    const username = socket.handshake.auth.current_username;
    const useruid = socket.handshake.auth.uid;

    if (email && username) {

        emailToSocketIdMap.set(email, socket.id);
        onlineUsers.add(email);
        io.emit("userOnlineStatus", { email, status: "online" });

        try {
            let user = await User.findOne({ email: email, username });
            if (!user) {
                const newUser = new User({
                    email: email,
                    username: username,
                    contacts: [],
                    uid: useruid
                });
                user = await newUser.save();
            }
        }
        catch (error) {
            console.error('Error storing user in database:', error);
        }
    }
    // Add this event handler inside the io.on("connection", ...) block

    socket.on("storeUid", async (data) => {
        const { email, uid } = data;
        try {
            // Find the user by email
            const user = await User.findOne({ email });

            if (!user) {
                // If user not found, emit a "failed" event
                socket.emit("uidStored", { success: false, error: "User not found" });
                return;
            }

            // Update the user's UID in the database
            user.uid = uid;
            await user.save();

            // Emit success event
            socket.emit("uidStored", { success: true });
        } catch (error) {
            console.error('Error storing UID:', error);
            // Emit an error event if there's an error during database query
            socket.emit("uidStored", { success: false, error: "Error storing UID" });
        }
    });

    socket.on("uid", async (data) => {
        const { userEmail, uid } = data;

        try {
            // Find the user by email
            const user = await User.findOne({ email: userEmail });

            if (!user) {
                // If user not found, emit a "failed" event
                socket.emit("uidResult", { success: false, error: "User not found" });
                return;
            }

            // Compare UID with the one stored in the database
            if (user.uid === uid && user.uid != null) {
                // UID matches, emit success event
                socket.emit("uidResult", { success: true });
            } else {
                // UID does not match, emit failure event
                socket.emit("uidResult", { success: false, error: "UID does not match" });
            }
        } catch (error) {
            console.error('Error finding user:', error);
            // Emit an error event if there's an error during database query
            socket.emit("uidResult", { success: false, error: "Error finding user" });
        }
    });

    socket.on("createGroup", async (data) => {
        try {
            const { groupName, adminEmail, memberEmails } = data;

            const admin = await User.findOne({ email: adminEmail });
            const members = await User.find({ email: { $in: memberEmails } });

            const newGroup = new Group({
                groupName: groupName,
                admin: admin._id,
                members: [admin._id, ...members.map(member => member._id)]
            });

            await newGroup.save();
            for (const member of members) {
                member.groups.push(newGroup._id);
                await member.save();
            }

            // Update admin's groups
            admin.groups.push(newGroup._id);
            await admin.save();

            // Emit success event with group details
            socket.emit("groupCreated", { success: true, group: newGroup });
        } catch (error) {
            console.error('Error creating group:', error);
            socket.emit("groupCreated", { success: false, error: error.message });
        }
    });

    socket.on("getGroupById", async (groupId) => {
        try {
            const group = await Group.findById(groupId).populate('members'); // Populate the 'members' field

            if (!group) {
                socket.emit("groupById", { error: "Group not found" });
                return;
            }
            // Emit the group details back to the client
            socket.emit("groupById", { group });
        } catch (error) {
            console.error("Error getting group by ID:", error);
            socket.emit("groupById", { error: "Error getting group by ID" });
        }
    });

    socket.on("getUsernameByEmail", async (email) => {
        try {
            // Find the user by email
            const user = await User.findOne({ email });
            if (!user) {
                // If user not found, emit an error event or empty response
                socket.emit("usernameByEmail", { error: "User not found" });
                return;
            }

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

        try {
            const imageUrl = await uploadProfilePicture(email, fileData);

            // Update the user's profile picture URL in the database with the Cloudinary URL
            await User.findOneAndUpdate({ email: email }, { profilePicture: imageUrl });


            socket.emit("profilePictureUploaded", { success: true });
        } catch (error) {
            console.error('Error uploading profile picture:', error);
            socket.emit("profilePictureUploaded", { success: false, error: error.message });
        }
    });

    socket.on("edit", async (data) => {
        const {payload,receiver,selectedIndex}=data;
        try {
            let message;

            // Check if the payload has an _id attribute
            if (payload._id) {
                // If _id exists, search by _id
                message = await Message.findById(payload._id);
            } else {
                console.log("Payload: ", payload);
                message = await Message.findOne({
                    sender: payload.email,
                    receiver: receiver,
                    Time: payload.Time
                });
            }
            if (!message) {
                socket.emit('edit_failed', { error: 'Message not found' });
                console.log("Message not found");
                return;
            }

            // Check if the message has already been edited
            if (message.Time.includes("Edited")) {
                socket.emit('edit_failed', { error: 'Message already edited' });
                console.log("Message already edited");
                return;
            }

            const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
            if (message.timestamp < fifteenMinutesAgo) {
                socket.emit('edit_failed', { error: 'Message timestamp is too old' });
                console.log("Message timestamp is too old");
                return;
            }

            message.message = payload.message;
            const previousTime = message.Time;
            message.Time = "Edited: " + previousTime;
            message.edited = true;
            await message.save();

            socket.emit('edit_success', { message: payload.message ,selectedIndex,receiver});

            // Check if the message type is "private"
            if (payload.type === "private") {
                const receiverSocketId = emailToSocketIdMap.get(payload.receiver);
                console.log("Receiver: ", receiverSocketId);
                if (receiverSocketId) {
                   console.log("Sending to ",payload);
                    socket.to(receiverSocketId).emit('edit_success', { message: payload.message ,selectedIndex,receiver});
                }
            }
        } catch (error) {
            console.error('Error editing message:', error);
            socket.emit('edit_failed', { error: 'An error occurred while editing the message' });
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
    socket.on("removeUserFromGroup", async (data) => {
        const { userEmail, groupId } = data;

        try {
            // Find the user by email
            const user = await User.findOne({ email: userEmail });

            if (!user) {
                // If user not found, emit an error event
                socket.emit("userRemovedFromGroup", { success: false, error: "User not found" });
                return;
            }

            // Find the group by ID
            const group = await Group.findById(groupId);

            if (!group) {
                // If group not found, emit an error event
                socket.emit("userRemovedFromGroup", { success: false, error: "Group not found" });
                return;
            }

            // Check if the user is a member of the group
            const userIndex = group.members.indexOf(user._id);

            if (userIndex === -1) {
                // If user is not a member of the group, emit an error event
                socket.emit("userRemovedFromGroup", { success: false, error: "User is not a member of the group" });
                return;
            }

            // Remove the user from the group
            group.members.splice(userIndex, 1);
            await group.save();

            // Remove the group from the user's groups
            const userGroupIndex = user.groups.indexOf(groupId);
            user.groups.splice(userGroupIndex, 1);
            await user.save();

            // Emit success event with removed user email
            socket.emit("userRemovedFromGroup", { success: true, removedUserEmail: user.email });
        } catch (error) {
            console.error('Error removing user from group:', error);
            // Emit an error event if there's an error during database query
            socket.emit("userRemovedFromGroup", { success: false, error: "Error removing user from group" });
        }
    });

    socket.on("getUserGroups", async (userEmail) => {
        try {
            const user = await User.findOne({ email: userEmail }).populate({
                path: 'groups',
                populate: {
                    path: 'admin members'
                }
            });

            if (!user) {
                // If user not found, emit an error event or empty list
                socket.emit("userGroups", { error: "User not found", groups: [] });
                return;
            }

            // Initialize an array to store group details
            const groupsWithNames = [];

            // Iterate through user's groups to retrieve group names and member details
            for (const group of user.groups) {
                // Find the group by its ID and populate the 'members' field
                const foundGroup = await Group.findById(group._id).populate('members');
                const adminUser = await User.findById(foundGroup.admin);

                if (foundGroup) {
                    // Extract member details
                    const members = foundGroup.members.map(member => ({
                        email: member.email,
                        profilePicture: member.profilePicture,
                        username: member.username,
                        isAdmin: (adminUser.email === member.email) || false
                    }));

                    groupsWithNames.push({
                        _id: foundGroup._id,
                        groupName: foundGroup.groupName,
                        members: members,
                        isAdmin: (adminUser.email === userEmail)
                    });
                }
            }

            // Emit the user's groups with their names and member details back to the client
            socket.emit("userGroups", { groups: groupsWithNames });
        }

        catch (error) {
            console.error("Error getting user groups:", error);
            // Emit an error event if there's an error during database query
            socket.emit("userGroups", { error: "Error getting user groups", groups: [] });
        }
    });
    socket.on("getGroupChatHistory", async (userEmail) => {
        try {
            // Find the user by their email address
            const user = await User.findOne({ email: userEmail });

            if (!user) {
                // If user not found, emit an error event or empty list
                socket.emit("groupChatHistory", { error: "User not found", history: [] });
                return;
            }

            // Retrieve the groups associated with the user
            const groups = await Group.find({ members: user._id });

            if (!groups || groups.length === 0) {
                // If user is not a member of any groups, emit an empty history list
                socket.emit("groupChatHistory", { history: [] });
                return;
            }

            // Initialize an array to store all group chat histories
            const allGroupChatHistory = [];

            // Iterate through each group to retrieve its chat history
            for (const group of groups) {
                const groupChatHistory = await getGroupChatHistory(group._id);
                allGroupChatHistory.push({ groupId: group._id, history: groupChatHistory });
            }

            // Emit the group chat histories back to the client
            socket.emit("groupChatHistory", { history: allGroupChatHistory });
        } catch (error) {
            console.error("Error getting group chat history:", error);
            // Emit an error event if there's an error during database query
            socket.emit("groupChatHistory", { error: "Error getting group chat history", history: [] });
        }
    });


    // Function to retrieve group chat history by group ID
    async function getGroupChatHistory(groupId) {
        try {

            const history = await Message.find({ sender: groupId, type: 'group' }).sort({ timestamp: 1 });

            return history;
        } catch (error) {
            console.error('Error retrieving group chat history:', error);
            return [];
        }
    }


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
            const receipient = await User.findOne({ email: payload.contactEmail });

            if (receipient) {
                // If the user is found, update their contacts
                const updatedUser = await User.findOneAndUpdate(
                    { email: payload.email }, // Find the user by their email
                    { $addToSet: { contacts: payload.contactEmail } }, // Add the contact to the contacts array if not already present
                    { new: true } // Return the updated user document
                );

                socket.emit("success", { username: receipient.username, profilepicture: receipient.profilePicture, contactEmail: payload.contactEmail });
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

        try {
            const { email, receiver, message, Time, url, reply, type } = payload;

            const messageData = {
                sender: email,
                receiver,
                message,
                Time,
                url: url || null,
                reply: reply || null,
                type: type || 'private',
                name: payload.name || null,
            };
            const newMessage = new Message(messageData);
            await newMessage.save();
            if (type === 'group') {
                const user = await User.findOne({ email: receiver });
                const group = await Group.findById(email).populate('members');
                if (!group) {
                    socket.emit("messageError", { success: false, error: "Group not found" });
                    return;
                }

                // Emit the message to all group members
                for (const member of group.members) {
                    const receiverSocketId = emailToSocketIdMap.get(member.email);

                    if (receiverSocketId) {
                        const modifiedPayload = {
                            ...payload,
                            group: group.groupName,
                            name: user.username
                        };
                        socket.to(receiverSocketId).emit("private message", modifiedPayload);
                    }
                }
            } else {

                const receiverSocketId = emailToSocketIdMap.get(receiver);
                const user = await User.findOne({ email });
                console.log("username", user.username);
                const modifiedPayload = {
                    ...payload,
                    name: user.username
                }
                if (receiverSocketId) {
                    socket.to(receiverSocketId).emit("private message", modifiedPayload);
                }
            }

            socket.emit("messageSent", { success: true });
        } catch (error) {
            console.error('Error sending message:', error);
            socket.emit("messageError", { success: false, error: error.message });
        }
    });

    socket.on("chat", (payload) => {
        io.emit("chat", payload);
    });

    socket.on("typing", (data) => {
        const receiverSocketId = emailToSocketIdMap.get(data.receiver);

        if (receiverSocketId) {
            socket.to(receiverSocketId).emit("notifyTyping", data);
        }
    });
    socket.on('fetchContactsStatus', (contacts, callback) => {

        const statuses = contacts.map(email => ({
            email: email,
            status: onlineUsers.has(email) ? 'online' : 'offline'
        }));
        callback(statuses);
    });

    socket.on("disconnect", () => {

        onlineUsers.delete(email); // Remove user from online users set
        io.emit("userOnlineStatus", { email, status: "offline" }); // Emit event for user offline status

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