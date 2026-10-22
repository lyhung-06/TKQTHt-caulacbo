FROM node:20.18.0-alpine3.20

WORKDIR /app
COPY package.json server.js ./

ENV NODE_ENV=production
EXPOSE 8080

USER node
CMD ["node", "server.js"]
