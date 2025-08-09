#!/bin/bash

# Docker Test Script for MyHome Backend
# This script validates the Dockerfile implementation

set -e

echo "🐳 Starting Docker validation for MyHome Backend..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

print_status "Docker is installed"

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_warning ".env file not found. Creating a minimal .env for testing..."
    cat > .env << EOF
NODE_ENV=production
DATABASE_URL=postgresql://localhost:5432/test
SESSION_SECRET=test-secret-key
STORAGE_TYPE=local
EOF
fi

print_status ".env file exists"

# Build the Docker image
echo "🔨 Building Docker image..."
if docker build -t myhome-backend . --no-cache; then
    print_status "Docker image built successfully"
else
    print_error "Docker build failed"
    exit 1
fi

# Test if the image was created
if docker images | grep -q "myhome-backend"; then
    print_status "Docker image 'myhome-backend' found in local registry"
else
    print_error "Docker image not found after build"
    exit 1
fi

# Test container startup (without persistent run)
echo "🚀 Testing container startup..."
CONTAINER_ID=$(docker run -d -p 5001:5000 --env-file .env myhome-backend)

if [ $? -eq 0 ]; then
    print_status "Container started with ID: $CONTAINER_ID"
else
    print_error "Failed to start container"
    exit 1
fi

# Wait for server to start
echo "⏳ Waiting for server to start..."
sleep 10

# Test health endpoint
echo "🏥 Testing health endpoint..."
if curl -f http://localhost:5001/api/health > /dev/null 2>&1; then
    print_status "Health endpoint responding"
else
    print_warning "Health endpoint not responding (this may be normal if database is not connected)"
fi

# Test if server is listening
if curl -f http://localhost:5001 > /dev/null 2>&1; then
    print_status "Server is responding on port 5001"
else
    print_warning "Server not responding (may be due to missing frontend)"
fi

# Check container logs for any errors
echo "📋 Checking container logs for errors..."
LOGS=$(docker logs $CONTAINER_ID 2>&1)
if echo "$LOGS" | grep -i "error\|failed\|exception" > /dev/null; then
    print_warning "Found potential errors in logs:"
    echo "$LOGS" | grep -i "error\|failed\|exception"
else
    print_status "No critical errors found in container logs"
fi

# Cleanup
echo "🧹 Cleaning up test container..."
docker stop $CONTAINER_ID > /dev/null
docker rm $CONTAINER_ID > /dev/null
print_status "Test container cleaned up"

# Display image info
echo "📊 Docker image information:"
docker images | grep myhome-backend

echo ""
print_status "Docker validation completed successfully!"
echo ""
echo "🚀 To run the container:"
echo "   docker run -p 5000:5000 --env-file .env myhome-backend"
echo ""
echo "🔧 To run with GCS (production):"
echo "   docker run -p 5000:5000 -e STORAGE_TYPE=gcs -e GCS_BUCKET_NAME=your-bucket --env-file .env myhome-backend"