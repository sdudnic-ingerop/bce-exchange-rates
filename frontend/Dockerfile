# Development stage
FROM node:20-alpine AS development

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Expose dev server port
EXPOSE 4200

# Start development server
CMD ["npm", "start", "--", "--host", "0.0.0.0", "--poll=2000"]
