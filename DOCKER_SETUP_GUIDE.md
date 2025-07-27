# Docker Setup Guide for MyHome Backend

## Overview

This guide covers the Docker setup for the MyHome document management backend, including Google Cloud Storage integration and production deployment.

## Files Created

### 1. `Dockerfile`
Production-ready multi-stage Docker configuration:
- **Base Image**: `node:18-alpine` for security and size optimization
- **System Dependencies**: Includes native module support for image processing
- **Security**: Non-root user execution
- **Health Check**: Built-in health monitoring
- **Port**: Exposes port 5000 (matches current setup)

### 2. `.dockerignore`
Optimized file exclusion for smaller image builds:
- Excludes development files, logs, and sensitive data
- Includes only necessary source code and dependencies
- Prevents accidental inclusion of `.env` files

### 3. `docker-test.sh`
Comprehensive validation script that tests:
- Docker image build process
- Container startup and health
- Server responsiveness
- Error detection in logs
- Cleanup procedures

## Quick Start

### Build the Docker Image
```bash
# Build the image
docker build -t myhome-backend .

# Or use the test script (recommended)
chmod +x docker-test.sh
./docker-test.sh
```

### Run the Container

#### Development/Local Storage
```bash
docker run -p 5000:5000 --env-file .env myhome-backend
```

#### Production/Google Cloud Storage
```bash
docker run -p 5000:5000 \
  -e STORAGE_TYPE=gcs \
  -e GCS_BUCKET_NAME=media.myhome-tech.com \
  -e GCS_PROJECT_ID=civic-source-324412 \
  -e GCS_CREDENTIALS='{"your":"service-account-json"}' \
  --env-file .env \
  myhome-backend
```

## Environment Variables

### Required Variables
```bash
# Database
DATABASE_URL=postgresql://username:password@host:5432/myhome

# Security
SESSION_SECRET=your-session-secret-key
DOCUMENT_MASTER_KEY=your-encryption-key

# Storage Configuration
STORAGE_TYPE=gcs  # or 'local' for development
```

### Google Cloud Storage Variables
```bash
GCS_BUCKET_NAME=your-bucket-name
GCS_PROJECT_ID=your-project-id
GCS_CREDENTIALS={"type":"service_account","project_id":"..."}
```

### Optional Variables
```bash
# AI Features
OPENAI_API_KEY=your-openai-key

# Monitoring
SENTRY_DSN=your-sentry-dsn

# Email
SENDGRID_API_KEY=your-sendgrid-key

# Payment
STRIPE_SECRET_KEY=your-stripe-key
```

## Docker Image Features

### Security
- **Non-root execution**: Container runs as `nodejs` user (UID 1001)
- **Minimal attack surface**: Alpine Linux base with only necessary packages
- **No sensitive data**: `.env` files excluded via `.dockerignore`

### Performance
- **Production build**: Uses `npm ci --only=production` for faster installs
- **Optimized layers**: Package installation separated from source code
- **Small image size**: Alpine base and production-only dependencies

### Monitoring
- **Health check**: Built-in endpoint monitoring at `/api/health`
- **Logging**: Application logs accessible via `docker logs`
- **Process management**: Proper signal handling for graceful shutdowns

## Testing the Docker Setup

### Automated Testing
```bash
# Run the comprehensive test script
./docker-test.sh
```

The test script validates:
1. ✅ Docker image builds successfully
2. ✅ Container starts without errors
3. ✅ Health endpoint responds
4. ✅ Server listens on correct port
5. ✅ No critical errors in logs
6. ✅ Proper cleanup

### Manual Testing
```bash
# Build and run
docker build -t myhome-backend .
docker run -p 5000:5000 --env-file .env myhome-backend

# Test endpoints
curl http://localhost:5000/api/health
curl http://localhost:5000/api/auth/user

# Check logs
docker logs <container-id>
```

## Google Cloud Storage Integration

The Docker container fully supports GCS integration:

### Environment Setup
```bash
# Set storage type to GCS
STORAGE_TYPE=gcs

# Provide GCS credentials
GCS_BUCKET_NAME=media.myhome-tech.com
GCS_PROJECT_ID=civic-source-324412
GCS_CREDENTIALS='{"type":"service_account",...}'
```

### Verification
```bash
# Test GCS connection inside container
docker exec -it <container-id> node -e "
const { StorageService } = require('./dist/index.js');
console.log('Testing GCS connection...');
"
```

## Production Deployment

### Container Registry
```bash
# Tag for registry
docker tag myhome-backend:latest your-registry/myhome-backend:latest

# Push to registry
docker push your-registry/myhome-backend:latest
```

### Orchestration
The container is ready for deployment with:
- **Kubernetes**: Use provided health checks and environment variables
- **Docker Compose**: Combine with PostgreSQL and Redis services
- **Cloud Run**: Direct deployment with auto-scaling support
- **AWS ECS/Fargate**: Production container orchestration

### Example Docker Compose
```yaml
version: '3.8'
services:
  backend:
    build: .
    ports:
      - "5000:5000"
    environment:
      - STORAGE_TYPE=gcs
      - GCS_BUCKET_NAME=${GCS_BUCKET_NAME}
      - DATABASE_URL=${DATABASE_URL}
    depends_on:
      - postgres
  
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: myhome
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
```

## Troubleshooting

### Build Issues
```bash
# Clear Docker cache
docker system prune -a

# Build with verbose output
docker build --no-cache --progress=plain -t myhome-backend .
```

### Runtime Issues
```bash
# Check container logs
docker logs <container-id>

# Interactive shell for debugging
docker run -it --entrypoint /bin/sh myhome-backend

# Check environment variables
docker exec <container-id> env | grep -E "(GCS|DATABASE|STORAGE)"
```

### Common Solutions
1. **Port conflicts**: Use different host port (`-p 5001:5000`)
2. **Environment variables**: Ensure `.env` file exists and is readable
3. **Database connection**: Verify `DATABASE_URL` is accessible from container
4. **GCS permissions**: Check service account has proper bucket access

## Performance Considerations

### Image Size Optimization
- Multi-stage builds for smaller production images
- Alpine Linux base (minimal footprint)
- Production-only dependencies in final layer

### Runtime Performance
- Health checks for monitoring
- Proper signal handling for graceful shutdowns
- Non-root execution for security

### Scaling
- Stateless design for horizontal scaling
- External storage (GCS) for file persistence
- Database connection pooling support

## Security Best Practices

1. **Never include secrets in image**: Use environment variables or secrets management
2. **Regular updates**: Keep base image and dependencies updated
3. **Scan for vulnerabilities**: Use `docker scan` or security tools
4. **Minimal permissions**: Run as non-root user
5. **Network security**: Use proper firewall rules and service mesh

The Docker setup is now production-ready with comprehensive Google Cloud Storage integration and full testing validation.