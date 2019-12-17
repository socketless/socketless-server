const http = require('http');
const EventEmitter = require('eventemitter3');
const SocketlessServer = require('.');

class FakeServerWebsocket extends EventEmitter {

  send(message) {
    this.clientWs.incoming.push(message);
  }

}

class FakeClientWebsocket {

  constructor() {
    this.incoming = [];
  }

  send(message) {
    this.serverWs.emit('message', message);
  }

  close() {
    this.closed = true;
    this.serverWs.emit('close');
  }

}

class FakeServerRequest extends EventEmitter {

  constructor(options = {}) {
    super();

    if (typeof options === 'string') {
      this.url = options;
      this.method = 'GET';
    } else {
      this.url = options.url;
      this.method = options.method;
    }

    const that = this;

    const origOn = this.on;
    this.on = function() {
      origOn.apply(that, arguments);
      return that;
    }

    const origEmit = this.emit;
    this.emit = function() {
      origEmit.apply(that, arguments);
      return that;
    }
  }

}

function FakeServerResponse() {
  var res = Object.create(http.ServerResponse.prototype);

  res._headers = {};

  res.sendStatus = function(statusCode) {
    this.status(statusCode);

    switch(statusCode) {
      case 200: this.send('OK'); break;
      case 403: this.send('Forbidden'); break;
      case 404: this.send('Not found'); break;
      case 500: this.send('Internal Server Error'); break;
      default: this.send(statusCode.toString());
    }
  }

  res.send = function send(body) {
    this.body = body;
    return this;
  }

  res.status = function status(code) {
    this.statusCode = code;
    return this;
  }

  res.setHeader = function setHeader(key, val) {
    this._headers[key] = val;
  }

  return res;
}

function testServer(config = {}) {
  if (config.restPort === undefined) config.restPort = null;
  if (config.websocketPort === undefined) config.websocketPort = null;
  if (config.onConnectUrl === undefined) config.onConnectUrl = null;
  if (config.onMsgUrl === undefined) config.onMsgUrl = null;

  const sls = new SocketlessServer(config);

  sls.req = function(reqOpts) {
    const req = new FakeServerRequest(reqOpts);
    const res = FakeServerResponse();

    //return new Promise((resolve, reject) => {
    //  function done(err) { if (err) reject(err); else resolve(res); }

    this._rest._router.handle(req, res, () => {});
    if (reqOpts.body) {
      req.emit('data', Buffer.from(reqOpts.body));
      req.emit('end');
    }
    return res;

    //});
  }

  sls.ws = function() {
    const serverWs = new FakeServerWebsocket();
    const clientWs = new FakeClientWebsocket();
    serverWs.clientWs = clientWs;
    clientWs.serverWs = serverWs;

    sls._wss.emit('connection', serverWs);
    return clientWs;
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

  describe("tags", () => {

    it('adds a tag', () => {
      const sls = testServer();
      const ws = sls.ws();
      sls.req('/addTag?sid=0&tag=t');

      const set = sls.tags.get('t');
      expect(set).toBeInstanceOf(Set);    // tag exists
      expect(set.size).toBe(1);
      const socket = Array.from(set)[0];
      expect(socket).toBe(ws.serverWs);   // and it contains our socket
    });

    it('sends to that tag', () => {
      const sls = testServer();
      const ws = sls.ws();
      sls.req('/addTag?sid=0&tag=t');
      sls.req({ url: '/sendToTag?tag=t', method: 'POST', body: 'BODY' });
      expect(ws.incoming.length).toBe(1);
      expect(ws.incoming[0]).toBe('BODY');
    });

    it("doesn't send to other tags", () => {
      const sls = testServer();
      const ws = sls.ws();
      sls.req('/addTag?sid=0&tag=t1');
      sls.req({ url: '/sendToTag?tag=t2', method: 'POST', body: 'BODY' });
      expect(ws.incoming.length).toBe(0);
    });

    it('removes socket from that tag on disconnect', () => {
      const sls = testServer();
      const ws = sls.ws();
      sls.req('/addTag?sid=0&tag=t');
      ws.close();

      const set = sls.tags.get('t');
      expect(set.size).toBe(0);
    });

  });

  describe('messageData', () => {

    it('should set and send', () => {
      const sls = testServer({ onMsgUrl: 'onMsgUrl' });
      const ws = sls.ws();
      sls.req('/setMessageData?sid=0&key=userId&val=coh');
      ws.send('BODY');

      const call = request.post.mock.calls[0][0];
      let msgData = call.headers['X-Socketless-MsgData'];
      msgData = msgData && JSON.parse(msgData);
      expect(msgData).toMatchObject({
        userId: 'coh'
      });
    });

  });

});
