const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection } = require('y-websocket/bin/utils');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req); // 正确调用
});

server.listen(1234, () => {
  console.log('WebSocket server running on ws://localhost:1234');
});
