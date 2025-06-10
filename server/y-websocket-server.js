const http = require('http');
const WebSocket = require('ws');
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils');
const Y = require('yjs');
const axios = require('axios');
const dotenv = require('dotenv');
const server = http.createServer();
const wss = new WebSocket.Server({ server });
require('dotenv').config();
const docs = new Map();

setPersistence({
  // 每次有用户进入房间时，初始化 Yjs 文档内容
  bindState: async (docName, ydoc) => {
    // 只在首次进入时触发
    const docId = docName.replace(/^doc-/, '');
    try {
      // 拉取数据库内容
      const res = await axios.get(`http://localhost:4000/documents/${docId}`, {
        headers: { 'X-Internal-Secret': process.env.YWS_INTERNAL_SECRET }
      });
      const dbContent = res.data.content;
      let ops = [];
      if (dbContent) {
        if (Array.isArray(dbContent)) {
          ops = dbContent;
        } else if (Array.isArray(dbContent.ops)) {
          ops = dbContent.ops;
        }
      }
      if (ops.length > 0) {
        const ytext = ydoc.getText('quill');

        ytext.delete(0, ytext.length);
        ytext.applyDelta(ops);
      } else {
        console.log('[y-websocket] bindState: 没有可用的 ops 数据', dbContent);
      }
    } catch (e) {
      console.error('[y-websocket] bindState 拉取数据库内容失败', e);
    }
    return ydoc;
  },
  // 可选：所有人离开房间时自动保存
  writeState: async (docName, ydoc) => {
    // 你可以选择不自动保存，只用前端保存按钮
  }
});

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req, { docs });
});

server.listen(1234, () => {
  console.log('WebSocket server running on ws://localhost:1234');
});
