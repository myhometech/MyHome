#!/bin/bash

# MyHome Document Encryption Admin Script
# Usage: ./admin-encrypt.sh [command]

if [ -f ".env" ]; then
    source .env
fi

case "$1" in
    "generate-key")
        echo "Generating new master encryption key..."
        tsx server/adminKeyManagement.ts generate-key
        ;;
    "test-encryption")
        echo "Testing encryption system..."
        tsx server/adminKeyManagement.ts test-encryption
        ;;
    "validate")
        echo "Validating encryption setup..."
        tsx server/adminKeyManagement.ts validate
        ;;
    "rotate-keys")
        echo "Starting key rotation process..."
        tsx server/adminKeyManagement.ts rotate-keys
        ;;
    "stats")
        echo "Fetching encryption statistics..."
        curl -X GET "http://localhost:5000/api/admin/encryption/stats" \
             -H "Authorization: Bearer $ADMIN_TOKEN" \
             -H "Content-Type: application/json"
        ;;
    *)
        echo "MyHome Document Encryption Admin Script"
        echo ""
        echo "Usage: ./admin-encrypt.sh [command]"
        echo ""
        echo "Commands:"
        echo "  generate-key    Generate a new master encryption key"
        echo "  test-encryption Test the encryption system"
        echo "  validate        Validate encryption setup"
        echo "  rotate-keys     Rotate document encryption keys"
        echo "  stats           Show encryption statistics"
        echo ""
        echo "Environment Variables Required:"
        echo "  DOCUMENT_MASTER_KEY - Master encryption key (256-bit hex)"
        echo "  DATABASE_URL        - PostgreSQL connection string"
        echo ""
        ;;
esac