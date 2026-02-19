FROM node:22-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --production=false

COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build && npm prune --production

EXPOSE 8080
CMD ["node", "dist/index.js"]
