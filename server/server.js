
require('dotenv').config();
const http = require('http');
const WebSocket = require('ws');
const Y = require('yjs');
const { Buffer } = require('buffer');

const utils = require('y-websocket/bin/utils.js');
const { LeveldbPersistence } = require('./y-mongodb');

const location = process.env.MONGODB_URI;
const collection = 'YjsWriting';
const ldb = new LeveldbPersistence(location, collection);

const production = process.env.PRODUCTION != null;
const port = process.env.PORT || 8080;


const server = http.createServer((request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' })
    response.end('okay')
});


// const wss = new WebSocket.Server({ server })
const wss = new WebSocket.Server({  noServer: true })

wss.on('connection', utils.setupWSConnection);
server.on('upgrade', (request, socket, head) => {
  // You may check auth of request here..
  /**
   * @param {any} ws
   */
  const handleAuth = ws => {
    wss.emit('connection', ws, request)
  }
  wss.handleUpgrade(request, socket, head, handleAuth)
});


utils.setPersistence({
  bindState: async (docName, ydoc) => {
    const persistedYdoc = await ldb.getYDoc(docName);
    const newUpdates = Y.encodeStateAsUpdate(ydoc);
    ldb.storeUpdate(docName, newUpdates)
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
    ydoc.on('update', async update => {
      const buf = Buffer.from(update)
      // console.log('buf ', buf);
      ldb.storeUpdate(docName, update);
    })
  },
  writeState: async (docName, ydoc) => {
    return Promise.resolve()
    // const persistedYdoc = await ldb.getYDoc(docName);
  }
})

server.listen(port);

console.log(`Listening to http://localhost:${port} ${production ? '(production)' : ''}`)
