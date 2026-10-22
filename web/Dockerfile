FROM node:20.18.0-alpine3.20

WORKDIR /app

# Install wget for Docker healthcheck
RUN apk add --no-cache wget tzdata

ENV TZ=Asia/Ho_Chi_Minh

COPY package*.json ./

RUN npm install --omit=dev --no-audit --no-fund

COPY . .
COPY scripts/configure-seed-passwords.js ./scripts/configure-seed-passwords.js

EXPOSE 3000

USER node

CMD ["node", "src/server.js"]
