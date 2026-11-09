FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Banco SQLite em volume persistente
ENV NODE_ENV=production \
    PORT=3000 \
    SAAC_DB_PATH=/data/saac.db
RUN mkdir -p /data && chown -R node:node /data /app
USER node

EXPOSE 3000
CMD ["node", "server.js"]
