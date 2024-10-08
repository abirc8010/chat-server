import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
    },
    username: {
        type: String,
        required: true,
    },
    password: {
        type: String,
        required: true,
    },
    uid: {
        type: String,
        default: null,
    },
    contacts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    profilePicture: {
        type: String,
        default: 'default_profile_picture.png' 
    },
    status: {
        type: String,
        default: 'offline'  
    },
    lastSeen: {
        type: Date,
        default: Date.now  
    },
    bio: {
        type: String,
        default: '' 
    },
    isActive: {
        type: Boolean,
        default: true  
    },
    groups: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group',
    }],
    messages: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
    }],
    token: {
        type: String,
        default: null
    },    
    createdAt: {
        type: Date,
        default: Date.now  
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true  
});

const User= mongoose.model("User",userSchema);
export {User};
