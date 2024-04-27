const app = require('express')();

const server = require('http').createServer(app);


const io = require('socket.io')(server,{
    cors:{
        origin:"*",
    }
});
    
io.on("connection", (socket) => {
    socket.on("chat", (payload) => {
        io.emit("chat", payload);
    });

})
server.listen(5000,()=>{
    console.log("server is listening to port 5000 ...");
});
 socket.on('disconnect', () => {
        console.log('A user disconnected');
    });
     socket.on("typing", data => {
    socket.broadcast.emit("notifyTyping", { user: data.user, message: data.message });
     }); 

socket.on("stopTyping", () => { socket.broadcast.emit("notifyStopTyping"); });