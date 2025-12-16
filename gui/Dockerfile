# Build stage
FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json tsconfig*.json vite.config.* vitest.config.ts vitest.setup.ts ./
COPY index.html ./
COPY src ./src
COPY public ./public

RUN npm install && npm run build

# Runtime stage
FROM node:20-slim
WORKDIR /app

# Serve built assets with a lightweight static server
RUN npm install -g serve
COPY --from=builder /app/dist ./dist

ENV HOST=0.0.0.0
ENV PORT=4173

EXPOSE 4173
CMD ["serve", "-s", "dist", "-l", "4173"]
