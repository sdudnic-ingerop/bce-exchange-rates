# Stage 1: Build Angular frontend
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend

# Copy frontend package files
COPY frontend/package*.json ./

# Install frontend dependencies
RUN npm ci

# Copy frontend source
COPY frontend/ ./

# Build Angular app for production
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci

# Copy backend source
COPY backend/ ./

# Build TypeScript
RUN npm run build

# Stage 3: Production image
FROM node:20-alpine

WORKDIR /app

# Copy backend package files and install production dependencies
COPY backend/package*.json ./
RUN npm ci --only=production

# Copy built backend
COPY --from=backend-build /app/dist ./dist
COPY --from=backend-build /app/data ./data

# Copy built Angular app to public directory
COPY --from=frontend-build /app/frontend/dist/frontend/browser ./public

EXPOSE 8000

CMD ["npm", "start"]
