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
    // 只处理 doc- 前缀（富文本）
    if (docName.startsWith('doc-')) {
      const docId = docName.replace(/^doc-/, '');
      try {
        // 拉取数据库内容
        const res = await axios.get(`http://192.168.43.104:4000/documents/${docId}`, {
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
    }
    // Markdown
    else if (docName.startsWith('md-')) {
      const docId = docName.replace(/^md-/, '');
      try {
        const res = await axios.get(`http://192.168.43.104:4000/documents/${docId}`, {
          headers: { 'X-Internal-Secret': process.env.YWS_INTERNAL_SECRET }
        });
        const dbContent = res.data.content;
        if (typeof dbContent === 'string') {
          const ytext = ydoc.getText('markdown');
          ytext.delete(0, ytext.length);
          ytext.insert(0, dbContent);
        } else {
          console.log('[y-websocket] bindState: 没有可用的 markdown 数据', dbContent);
        }
      } catch (e) {
        console.error('[y-websocket] bindState 拉取 markdown 数据库内容失败', e);
      }
    }
        // Sheet（表格）
    else if (docName.startsWith('sheet-')) {
      const docId = docName.replace(/^sheet-/, '');
      try {
        // 拉取数据库内容
        const res = await axios.get(`http://192.168.43.104:4000/documents/${docId}`, {
          headers: { 'X-Internal-Secret': process.env.YWS_INTERNAL_SECRET }
        });
        const dbContent = res.data.content;
        const yarray = ydoc.getArray('table');
        yarray.delete(0, yarray.length);
        if (Array.isArray(dbContent) && dbContent.length > 0) {
          for (let i = 0; i < dbContent.length; i++) {
            yarray.push([dbContent[i]]);
          }
        } else {
          // 数据库无内容时插入初始10行
          const initialRows = 10;
          const initialCols = 5;
          for (let i = 0; i < initialRows; i++) {
            yarray.push([Array.from({ length: initialCols }, () => '')]);
          }
        }
      } catch (e) {
        console.error('[y-websocket] bindState 拉取 sheet 数据库内容失败', e);
      }
    }
    return ydoc;
  },


  //所有人离开房间时自动保存
  writeState: async (docName, ydoc) => {
    // 选择不自动保存，只用前端保存按钮
  }
});

wss.on('connection', (conn, req) => {
  setupWSConnection(conn, req, { docs });
});

server.listen(1234, '0.0.0.0', () => {
  console.log('WebSocket server running on ws://192.168.43.104:1234');
});

