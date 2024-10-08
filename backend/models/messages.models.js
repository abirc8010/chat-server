import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true, 
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: false, 
    },
    group: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Group', 
        required: false,
    },
    content: {
        type: String,
        required: true, 
    },
    timestamp: {
        type: Date,
        default: Date.now, 
    },
    mediaUrl: {
        type: String,
        default: null,
    },
    replyTo: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message', 
        default: null,
    },
    mentions: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        default: [], 
    }],
    readBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        default: [], 
    }],
    type: {
        type: String,
        enum: ['private', 'group'], 
        required: true,
        default: 'private', 
    },
}, {
    timestamps: true, 
});

module.exports = mongoose.model('Message', messageSchema);
