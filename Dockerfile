# Dockerfile for Railway deployment - Server only
FROM node:22-alpine

# Install ffmpeg and other necessary packages
RUN apk add --no-cache ffmpeg python3 py3-pip make g++

WORKDIR /app

# Copy server package files
COPY server/package*.json ./server/
COPY server/tsconfig.json ./server/

# Install server dependencies (including dev dependencies for build)
WORKDIR /app/server
RUN npm cache clean --force && npm install

# Copy server source code
COPY server/ ./

# Build the server
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm install --omit=dev && npm cache clean --force

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001

# Change ownership of the app directory
RUN chown -R backend:nodejs /app
USER backend

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the server
CMD ["npm", "start"]