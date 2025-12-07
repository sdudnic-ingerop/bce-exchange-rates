# Multi-stage build: Angular frontend + Fastify backend

# 1) Frontend build
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build -- --configuration=production

# 2) Backend build
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ .
RUN npm run build

# 3) Runtime
FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/backend

# Backend runtime deps + build
COPY --from=backend-builder /app/backend/node_modules ./node_modules
COPY --from=backend-builder /app/backend/dist ./dist
COPY --from=backend-builder /app/backend/package*.json ./

# Frontend build served statically by Fastify
COPY --from=frontend-builder /app/frontend/dist/bce-exchange-ui ./public

EXPOSE 8000

CMD ["node", "./dist/server.js"]
