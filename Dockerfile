# Use Node.js 18 Alpine for smaller image size and better security
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Install system dependencies needed for native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy TypeScript configuration and build dependencies
COPY tsconfig.json ./
COPY drizzle.config.ts ./

# Copy source code
COPY server/ ./server/
COPY shared/ ./shared/
COPY types/ ./types/
COPY client/ ./client/

# Install build dependencies and build the application
RUN npm install --save-dev typescript tsx @types/node esbuild
RUN npm run build

# Remove dev dependencies to reduce image size
RUN npm prune --production

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Create uploads directory with proper permissions
RUN mkdir -p /app/uploads && chown -R nodejs:nodejs /app/uploads
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port (using 5000 to match your current setup)
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:5000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]