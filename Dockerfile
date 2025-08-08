# ---------- Build stage ----------
FROM node:20-slim AS build
WORKDIR /app

# Install system dependencies for build
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files and install all dependencies (including devDependencies for build)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build both client and server
RUN npm run build && \
    mkdir -p dist/scripts && \
    npx esbuild server/scripts/seedAdmin.ts --platform=node --packages=external --bundle --format=esm --outdir=dist/scripts

# ---------- Runtime stage ----------
FROM node:20-slim AS runtime
WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Install PM2 globally
RUN npm install -g pm2

# Install system dependencies for runtime (curl for health check)
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/package*.json ./

# Install only production dependencies  
RUN npm ci --omit=dev && npm cache clean --force

# Create directories for runtime config and uploads
RUN mkdir -p public uploads

# Copy entrypoint script
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Copy PM2 ecosystem file
COPY pm2.config.cjs ./pm2.config.cjs

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:5000/healthz || exit 1

# Use entrypoint script
CMD ["./entrypoint.sh"]