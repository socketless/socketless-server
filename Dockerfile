FROM node:alpine
WORKDIR /usr/src/app
COPY package.json yarn.lock ./

RUN yarn install --production=true
COPY index.js server.js ./

EXPOSE 4000
CMD [ "node", "server.js" ]
