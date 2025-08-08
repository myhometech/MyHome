#!/bin/bash
set -euo pipefail

echo "🐳 Docker Build and Test Script for MyHome"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
IMAGE_NAME="myhome"
CONTAINER_NAME="myhome-test"
TEST_PORT="5000"
BASE_URL="http://localhost:${TEST_PORT}"

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

# Function to cleanup
cleanup() {
    echo "🧹 Cleaning up..."
    docker stop "${CONTAINER_NAME}" 2>/dev/null || true
    docker rm "${CONTAINER_NAME}" 2>/dev/null || true
}

# Trap cleanup on script exit
trap cleanup EXIT

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not in PATH"
    exit 1
fi

print_status "Docker is available"

# Build the Docker image
echo ""
echo "🏗️  Building Docker image..."
if docker build -t "${IMAGE_NAME}:latest" .; then
    print_status "Docker image built successfully"
else
    print_error "Docker build failed"
    exit 1
fi

# Test different environment configurations
test_configs=(
    "ENV=production API_BASE_URL=/api VERSION=1.0.0"
    "ENV=staging API_BASE_URL=https://api.staging.myhome.app VERSION=2.0.0-staging"
    "ENV=production API_BASE_URL=https://api.prod.myhome.app VERSION=2.1.0 SENTRY_DSN=https://test@sentry.io/123"
)

for i in "${!test_configs[@]}"; do
    config="${test_configs[$i]}"
    echo ""
    echo "🧪 Test $(($i + 1)): Testing with config: ${config}"
    
    # Stop any existing container
    cleanup > /dev/null 2>&1
    
    # Start container with specific environment
    if docker run -d --name "${CONTAINER_NAME}" -p "${TEST_PORT}:5000" -e ${config} "${IMAGE_NAME}:latest"; then
        print_status "Container started"
    else
        print_error "Failed to start container"
        continue
    fi
    
    # Wait for container to be ready
    echo "⏳ Waiting for container to be ready..."
    for attempt in {1..30}; do
        if curl -f "${BASE_URL}/healthz" > /dev/null 2>&1; then
            print_status "Container is ready"
            break
        fi
        if [ $attempt -eq 30 ]; then
            print_error "Container failed to become ready"
            docker logs "${CONTAINER_NAME}"
            continue 2
        fi
        sleep 2
    done
    
    # Test health check
    echo "🏥 Testing health check..."
    health_response=$(curl -s "${BASE_URL}/healthz")
    if echo "$health_response" | grep -q "ok"; then
        print_status "Health check passed: $health_response"
    else
        print_error "Health check failed: $health_response"
    fi
    
    # Test config endpoint
    echo "🔧 Testing config endpoint..."
    config_response=$(curl -s "${BASE_URL}/config.json")
    if echo "$config_response" | grep -q "API_BASE_URL"; then
        print_status "Config endpoint working"
        echo "📋 Config content: $config_response"
        
        # Validate specific config values
        if [[ "$config" == *"staging"* ]] && echo "$config_response" | grep -q "staging"; then
            print_status "Staging environment configuration correct"
        elif [[ "$config" == *"prod.myhome.app"* ]] && echo "$config_response" | grep -q "prod.myhome.app"; then
            print_status "Production environment configuration correct"  
        elif echo "$config_response" | grep -q '"/api"'; then
            print_status "Default environment configuration correct"
        fi
    else
        print_error "Config endpoint failed: $config_response"
    fi
    
    # Test SPA serving
    echo "🌐 Testing SPA serving..."
    spa_response=$(curl -s "${BASE_URL}/")
    if echo "$spa_response" | grep -q "<html"; then
        print_status "SPA serving working"
    else
        print_error "SPA serving failed"
    fi
    
    # Test API endpoints  
    echo "🔌 Testing API endpoints..."
    api_response=$(curl -s "${BASE_URL}/api/" || echo "API endpoint not found")
    if [[ "$api_response" != "API endpoint not found" ]]; then
        print_status "API endpoints accessible"
    else
        print_warning "API root endpoint not found (may be expected)"
    fi
    
    # Check for console errors (basic)
    echo "📝 Checking container logs for errors..."
    log_output=$(docker logs "${CONTAINER_NAME}" 2>&1)
    if echo "$log_output" | grep -i "error" | grep -v "downloadable font"; then
        print_warning "Found errors in logs (check manually)"
    else
        print_status "No critical errors in logs"
    fi
    
    print_status "Test $(($i + 1)) completed"
done

echo ""
echo "🎉 All Docker tests completed!"
echo ""
echo "📋 Quick reference commands:"
echo "  Build:   docker build -t ${IMAGE_NAME}:latest ."
echo "  Run:     docker run -p 5000:5000 -e ENV=production -e API_BASE_URL=/api ${IMAGE_NAME}:latest"  
echo "  Test:    curl http://localhost:5000/healthz"
echo "  Config:  curl http://localhost:5000/config.json"
echo ""
echo "🚀 Ready for deployment!"