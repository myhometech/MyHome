# Docker Deployment Guide - MyHome Application

## Overview
This guide covers the complete Docker setup for MyHome, including multi-stage builds, PM2 process management, and runtime configuration injection for production deployments.

## Architecture

### Multi-Stage Docker Build
- **Build Stage**: Compiles frontend and backend in Node.js environment
- **Runtime Stage**: Minimal production image with PM2 process manager
- **Runtime Config**: Environment-based configuration injection at startup

### Container Features
- **Process Management**: PM2 for production-grade process handling
- **Health Checks**: Built-in health monitoring endpoints
- **Environment Agnostic**: Same image for staging/production with different env vars
- **Security**: Non-root user execution and minimal attack surface

## Quick Start

### Build the Docker Image
```bash
docker build -t myhome:latest .
```

### Run with Default Configuration
```bash
docker run -p 5000:5000 \
  -e ENV=production \
  -e API_BASE_URL=/api \
  -e VERSION=1.0.0 \
  myhome:latest
```

### Test the Deployment
```bash
# Health check
curl http://localhost:5000/healthz

# Configuration endpoint
curl http://localhost:5000/config.json

# Frontend SPA
curl http://localhost:5000/
```

## Environment Variables

### Required Variables
- `NODE_ENV`: Runtime environment (`production`, `staging`, `development`)
- `PORT`: Application port (default: 5000)

### Configuration Variables
- `API_BASE_URL`: Base URL for API calls (default: `/api`)
- `ENV`: Environment identifier for frontend (default: `production`)
- `VERSION`: Application version (default: `1.0.0`)
- `GIT_SHA`: Git commit hash for versioning (optional)

### External Services
- `SENTRY_DSN`: Sentry error tracking DSN (optional)
- `DATABASE_URL`: PostgreSQL connection string
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to GCS service account key
- `STRIPE_SECRET_KEY`: Stripe payment processing key

## Deployment Scenarios

### Production Deployment
```bash
docker run -d \
  --name myhome-prod \
  --restart unless-stopped \
  -p 5000:5000 \
  -e NODE_ENV=production \
  -e ENV=production \
  -e API_BASE_URL=https://api.myhome.app \
  -e VERSION=2.1.0 \
  -e GIT_SHA=${GITHUB_SHA} \
  -e DATABASE_URL=${DATABASE_URL} \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/credentials.json \
  -e STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY} \
  -e SENTRY_DSN=${SENTRY_DSN} \
  -v /path/to/credentials.json:/app/credentials.json:ro \
  -v myhome-uploads:/app/uploads \
  myhome:${GITHUB_SHA}
```

### Staging Deployment
```bash
docker run -d \
  --name myhome-staging \
  --restart unless-stopped \
  -p 5000:5000 \
  -e NODE_ENV=staging \
  -e ENV=staging \
  -e API_BASE_URL=https://api.staging.myhome.app \
  -e VERSION=2.1.0-staging \
  -e DATABASE_URL=${STAGING_DATABASE_URL} \
  myhome:latest
```

### Docker Compose (Development)
```bash
docker-compose up -d
```

## PM2 Configuration

### Default PM2 Settings
- **Process Name**: `myhome-server`
- **Instances**: 1 (configurable via `PM2_INSTANCES` env var)
- **Memory Limit**: 500MB auto-restart
- **Log Aggregation**: Stdout/stderr merged for container logs

### PM2 Monitoring
```bash
# Attach to running container
docker exec -it myhome-prod bash

# View PM2 status
pm2 status

# View logs
pm2 logs myhome-server

# Restart process
pm2 restart myhome-server
```

## Health Monitoring

### Built-in Health Checks
- **Container**: Docker `HEALTHCHECK` runs every 30s
- **Application**: `/healthz` endpoint for load balancer probes
- **PM2**: Automatic process restart on crashes

### Monitoring Endpoints
```bash
# Application health
GET /healthz
# Response: {"status":"ok","version":"1.0.0","timestamp":"2025-01-01T12:00:00.000Z"}

# Runtime configuration
GET /config.json  
# Response: {"API_BASE_URL":"/api","ENV":"production","VERSION":"1.0.0"}

# PM2 process status (inside container)
pm2 jlist
```

## File Structure in Container

```
/app/
├── dist/
│   ├── index.js              # Built server
│   └── public/               # Built frontend
├── public/
│   └── config.json          # Runtime-generated config
├── uploads/                 # Document storage (volume mount)
├── entrypoint.sh           # Startup script
├── pm2.config.cjs          # PM2 ecosystem file
└── package.json            # Dependencies
```

## Build Optimizations

### Build Performance
- **Multi-stage**: Separates build and runtime environments
- **Layer Caching**: Optimized COPY order for dependency caching
- **Production Install**: Only production dependencies in runtime image

### Runtime Optimizations
- **Minimal Base**: Node.js slim image reduces attack surface
- **Process Management**: PM2 handles crashes and memory management
- **Health Checks**: Early failure detection for orchestrators

## Troubleshooting

### Common Issues

#### Container Won't Start
```bash
# Check logs
docker logs myhome-prod

# Common fixes:
# - Verify environment variables
# - Check database connectivity
# - Ensure proper file permissions
```

#### Configuration Not Loading
```bash
# Verify config generation
docker exec myhome-prod cat /app/public/config.json

# Check server config location
docker exec myhome-prod ls -la /app/server/public/
```

#### Health Check Failures
```bash
# Manual health check
docker exec myhome-prod curl -f localhost:5000/healthz

# PM2 process status
docker exec myhome-prod pm2 status
```

### Debug Mode
```bash
# Run with debug output
docker run -it --rm \
  -p 5000:5000 \
  -e NODE_ENV=production \
  -e DEBUG=true \
  myhome:latest
```

## Testing

### Automated Testing
```bash
# Run comprehensive Docker tests
./docker-test.sh

# Manual validation
docker build -t myhome:test .
docker run -p 5000:5000 -e ENV=production myhome:test
```

### Performance Testing
```bash
# Load test health endpoint
ab -n 1000 -c 10 http://localhost:5000/healthz

# Memory usage monitoring
docker stats myhome-prod
```

## Security Considerations

### Container Security
- **Non-root User**: Process runs as Node.js user, not root
- **Minimal Image**: Reduced attack surface with slim base image
- **Read-only Mounts**: Configuration files mounted read-only
- **Network Isolation**: Container network separation

### Secret Management
- **Environment Variables**: Secure secret injection at runtime
- **Volume Mounts**: Service account keys via secure mounts
- **No Hardcoded Secrets**: All secrets externally provided

### Production Hardening
```bash
# Run with security options
docker run -d \
  --name myhome-prod \
  --read-only \
  --tmpfs /tmp \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  -p 5000:5000 \
  myhome:latest
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Deploy MyHome
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Build Docker Image
        run: |
          docker build -t myhome:${{ github.sha }} .
          
      - name: Test Image
        run: |
          ./docker-test.sh
          
      - name: Deploy to Production
        run: |
          docker tag myhome:${{ github.sha }} registry.com/myhome:latest
          docker push registry.com/myhome:latest
```

## Status: ✅ PRODUCTION READY
Complete Docker deployment solution with PM2 process management, runtime configuration injection, and comprehensive testing framework.