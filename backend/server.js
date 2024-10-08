import express from 'express';
import http from 'http';
import mongoose from 'mongoose'; 
import { initializeSocket } from './controllers/socket.js'; 
import router from './routes/user.routes.js';
import cors from 'cors';
const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/webchat'; 

app.use(express.json());
app.use(cors());
const server = http.createServer(app);


const io = initializeSocket(server);

mongoose.connect(MONGODB_URL)
.then(() => {
    console.log('Connected to MongoDB');
})
.catch((error) => {
    console.error('Error connecting to MongoDB:', error);
});


app.use('/api/v1/users', router);

app.get('/', (req, res) => {
    res.send('Socket.IO server is running!');
});


server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
