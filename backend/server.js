const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
    }
});
const usernameToSocketIdMap = new Map();
io.on("connection", (socket,next) => {
    const username = socket.handshake.auth.username;
    console.log("User connected",username);
       usernameToSocketIdMap.set(username, socket.id);
       console.log(usernameToSocketIdMap);
    socket.on("private message", (payload) => {
         const receiverSocketId = usernameToSocketIdMap.get(payload.receiver);

        console.log("private message", receiverSocketId);
        socket.to(receiverSocketId).emit("private message", payload);
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