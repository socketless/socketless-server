# socketless-server

WIP: A websocket router for serverless apps.  Follow on Github.

![npm](https://img.shields.io/npm/v/socketless-server) [![CircleCI](https://img.shields.io/circleci/build/github/socketless/socketless-server)](https://circleci.com/gh/socketless/socketless-server) [![coverage](https://img.shields.io/codecov/c/github/socketless/socketless-server)](https://codecov.io/gh/socketless/socketless-server) ![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)

See https://github.com/socketless/socketless-project.

## Quick Start

```js
const SocketlessServer = require('socketless/server');

new SocketlessServer(/* optional config */);
```

```
# Lambdas to be called on new connection or incoming message
SOCKETLESS_ON_CONNECT_URL=
SOCKETLESS_ON_MESSAGE_URL=

# Ports (and their defaults) to accept new connections
SOCKETLESS_WEBSOCKET_PORT=4000
SOCKETLESS_REST_PORT=4000

# TODO
SOCKETLESS_REST_ALLOW=127.0.0.1
REDIS_DB=
```
