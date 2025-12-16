FROM node:18-slim AS builder
WORKDIR /app

COPY package*.json tsconfig.json ./
COPY src ./src

RUN npm install && npm run build

FROM node:18-slim
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY package*.json ./

RUN npm install --omit=dev

ENV NODE_ENV=production

CMD ["node", "dist/index.cjs"]
