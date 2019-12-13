const http = require("http");
const WebSocket = require('ws');
const express = require("express");
const uuidv4 = require('uuid/v4');
const request = require('request');
const querystring = require('querystring');
const debug = require('debug')('socketless');

const SOCKETLESS_WEBSOCKET_PORT = process.env.SOCKETLESS_WEBSOCKET_PORT || 4000;
const SOCKETLESS_REST_PORT = process.env.SOCKETlESS_REST_PORT || 4000;
const SOCKETLESS_ON_MSG_URL = process.env.SOCKETLESS_ON_MSG_URL || 'http://localhost:3000/api/onMsg';
const SOCKETLESS_ON_CONNECT_URL = process.env.SOCKETLESS_ON_CONNECT_URL || 'http://localhost:3000/api/onConnect';

/*
  TODO

  TODAY, optional config in constructor

  - API
    - debug=true parameter, return number of sockets sent to, timing stats
    - should always return JSON answer with some info.

*/

class SocketlessServer {

  constructor(config = {}) {

    this.instanceId = uuidv4();

    const websocketPort = config.websocketPort !== undefined ? config.websocketPort : SOCKETLESS_WEBSOCKET_PORT;
    const restPort = config.restPort !== undefined ? config.restPort : SOCKETLESS_REST_PORT;

    const onMsgUrl = config.onMsgUrl !== undefined ? config.onMsgUrl : SOCKETLESS_ON_MSG_URL;
    const onConnectUrl = config.onConnectUrl !== undefined ? config.onConnectUrl : SOCKETLESS_ON_CONNECT_URL;

    // REST server
    const rest = this._rest = express();
    const restServer = this._restServer = http.createServer(rest);

    if (restPort)
    restServer.listen(restPort, () => {
      console.log("Listening for internal REST requests on port " + restPort);
    });

    rest.get('/addTag', (req, res) => {
      debug('/addTag %o', req.query);
      const socket = this.sockets.get(parseInt(req.query.sid));
      const tag = req.query.tag;

      if (!this.tags.has(tag))
        this.tags.set(tag, new Set());

      this.tags.get(tag).add(socket);

      if (!socket.tags)
        socket.tags = new Set();

      socket.tags.add(tag);

      res.sendStatus(200);
    });

    rest.post('/sendToTag', (req, res) => {
      const socketsWithTag = this.tags.get(req.query.tag);

      if (socketsWithTag) {
        /* // TODO think about better way to handle non-text & streaming
          since sendToTag honors content-type, probably a good start
        req.on('data', chunk => {
          console.log(5, typeof chunk, chunk)
          socketsWithTag.forEach( ws => ws.send(chunk) );
        });
        */
       let body = [];
       req
        .on('data', chunk => body.push(chunk))
        .on('end', () => {
          body = Buffer.concat(body).toString();
          debug('/sendToTag %o %s', req.query, body);
          socketsWithTag.forEach( ws => ws.send(body) )
        });
      }

      res.sendStatus(200);
    });

    rest.get('/setMessageData', (req, res) => {
      debug('/setMessageData %o', req.query);
      const { sid, key, val } = req.query;
      const socket = this.sockets.get(parseInt(sid));

      socket.msgData[key] = val;
      socket.msgDataStr = JSON.stringify(socket.msgData);
      res.sendStatus(200);
    });

    const wssOpts = {};
    if (restPort === websocketPort)
      wssOpts.server = restServer;
    else
      wssOpts.port = websocketPort;

    // TODO allow optional settings
    const wss = this._wss = new WebSocket.Server(wssOpts);

    console.log("Listening for WebSocket connections on port " + websocketPort);

    this.sockets = new Map();
    this.socketCounter = 0;
    this.tags = new Map();

    wss.on('connection', ws => {
      const socketId = this.socketCounter++;
      this.sockets.set(socketId, ws);

      ws.msgData = {};
      ws.msgDataStr = '';

      debug('client connect %s', socketId);

      if (onConnectUrl) {
        debug('-> ' + onConnectUrl + '?' + querystring.stringify({ sid: socketId }));
        request(onConnectUrl + '?' + querystring.stringify({ sid: socketId }), (error, response, body) => {
          debug('<- ' + onConnectUrl + '?' + querystring.stringify({ sid: socketId }));
          if (error || body !== 'OK')
            console.log('<- ' + onConnectUrl + '?' + querystring.stringify({ sid: socketId }));
          if (error)
            console.log(error);
          if (body !== 'OK')
            console.log(body);
        });
      }

      ws.on('close', () => {
        if (ws.tags)
          ws.tags.forEach(tag => this.tags.get(tag).delete(ws));
      });

      ws.on('message', message => {
        debug('received: %s', message);

        const url = onMsgUrl + '?' + querystring.stringify({ sid: socketId });

        const reqOpts = { url, body: message, headers: {} };

        if (ws.msgDataStr)
          reqOpts.headers['X-Socketless-MsgData'] = ws.msgDataStr;

        if (typeof message === 'string') {
          reqOpts.headers['Content-type'] = 'text/plain';
        } else {
          // application/octet-stream ?
          console.log('ERROR untested non-string message, ignoring');
          console.log(message);
        }

        if (onMsgUrl) {
          debug(`-> ${url}, body: ${message.substring(0, 20)}`);
          request.post(reqOpts, (error, response, body) => {
            debug(`<- ${url} [${response && response.statusCode}], body: ${body.substring(0, 20)}`);
            if (error || body !== 'OK')
              console.log(`<- ${url} [${response && response.statusCode}], body: ${body.substring(0, 20)}`);
            if (error)
              console.log("    ", error);
            if (body !== 'OK')
              console.log("    ", body);
          });
        }
      }); /* ws.on('message') */

    }); /* wss.on('connection') */

  }

}

module.exports = SocketlessServer;
