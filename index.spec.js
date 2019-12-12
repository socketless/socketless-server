const SocketlessServer = require('.');
const EventEmitter = require('eventemitter3');

class FakeServerWebsocket extends EventEmitter {

  send() {
    console.log('send XXX TODO', arguments);
  }

}

class FakeClientWebsocket {

  constructor({ serverWs }) {
    this.serverWs = serverWs;
  }

  send(message) {
    this.serverWs.emit('message', message);
  }

}

class FakeResponse {

  status(statusCode) {
    this.statusCode = statusCode;
  }

  send(body) {
    this.body = body;
  }

  sendStatus(statusCode) {
    this.status(statusCode);

    switch(statusCode) {
      case 200: this.send('OK'); break;
      case 403: this.send('Forbidden'); break;
      case 404: this.send('Not found'); break;
      case 500: this.send('Internal Server Error'); break;
    }
  }

}

function testServer(config = {}) {
  if (config.restPort === undefined) config.restPort = null;
  if (config.websocketPort === undefined) config.websocketPort = null;
  if (config.onConnectUrl === undefined) config.onConnectUrl = null;
  if (config.onMsgUrl === undefined) config.onMsgUrl = null;

  const sls = new SocketlessServer(config);

  sls.request = function(req) {
    const res = new FakeResponse();

    if (typeof req === 'string')
      req = { url: req, method: 'GET' };

    return new Promise((resolve, reject) => {
      function done(err) { if (err) reject(err); else resolve(); }
      this._rest._router.handle({ url: '/foo', method: 'GET' }, res, done);
    });
  }

  sls.ws = function() {
    const serverWs = new FakeServerWebsocket();
    const ws = new FakeClientWebsocket({ serverWs });

    sls._wss.emit('connection', serverWs);
    return ws;
  }

  return sls;
}

const request = require('request');
jest.mock('request');

describe('Websockets', () => {

  it('requests to onConnectUrl on connect', () => {
    const sls = testServer({ onConnectUrl: 'onConnectUrl' });
    sls.ws();

    expect(request.mock.calls.length).toBe(1);
    expect(request.mock.calls[0][0]).toBe('onConnectUrl?sid=0');
  });

  it('requests to onMsgUrl on incoming websocket message', () => {
    const sls = testServer({ onMsgUrl: 'onMsgUrl' });
    const ws = sls.ws();
    ws.send('BODY');

    expect(request.post.mock.calls.length).toBe(1);
    expect(request.post.mock.calls[0][0]).toMatchObject({
      url: 'onMsgUrl?sid=0',
      body: 'BODY',
      headers: {
        'Content-type': 'text/plain',
      }
    });
  });

});

describe('REST API', () => {

});
