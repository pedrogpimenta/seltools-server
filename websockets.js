const io = require('socket.io')(server, {
  cors: {
    origin: "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

io.on('connection', socket => {
  console.log('client connected');

  socket.on('disconnect', (reason) => {
    console.log('client disconnected')
  });
});
