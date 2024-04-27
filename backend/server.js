const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
    }
});

io.on("connection", (socket) => {
    console.log("User connected");

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
