#!/bin/bash

# MyHome Document Encryption Setup Script
# This script sets up the encryption master key for the document management system

echo "MyHome Document Encryption Setup"
echo "================================="
echo ""

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    touch .env
fi

# Check if master key already exists
if grep -q "DOCUMENT_MASTER_KEY=" .env; then
    echo "⚠️  Master key already exists in .env file"
    echo ""
    echo "Current encryption status:"
    if [ -n "$DOCUMENT_MASTER_KEY" ]; then
        echo "✅ Master key is set"
    else
        echo "❌ Master key variable exists but is empty"
    fi
    echo ""
    read -p "Do you want to generate a new master key? (this will replace the existing one) [y/N]: " replace_key
    
    if [[ ! $replace_key =~ ^[Yy]$ ]]; then
        echo "Keeping existing master key."
        exit 0
    fi
fi

echo "Generating new 256-bit master encryption key..."

# Generate a 256-bit (32-byte) random key in hex format
MASTER_KEY=$(openssl rand -hex 32)

if [ $? -ne 0 ]; then
    echo "❌ Error: Failed to generate master key. Please ensure OpenSSL is installed."
    exit 1
fi

# Add or update the master key in .env file
if grep -q "DOCUMENT_MASTER_KEY=" .env; then
    # Replace existing key
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/DOCUMENT_MASTER_KEY=.*/DOCUMENT_MASTER_KEY=$MASTER_KEY/" .env
    else
        # Linux
        sed -i "s/DOCUMENT_MASTER_KEY=.*/DOCUMENT_MASTER_KEY=$MASTER_KEY/" .env
    fi
else
    # Add new key
    echo "DOCUMENT_MASTER_KEY=$MASTER_KEY" >> .env
fi

echo "✅ Master encryption key generated and saved to .env file"
echo ""
echo "Key details:"
echo "- Length: 256 bits (32 bytes)"
echo "- Format: Hexadecimal"
echo "- Algorithm: AES-256-GCM"
echo ""
echo "⚠️  IMPORTANT SECURITY NOTES:"
echo "1. Keep your .env file secure and never commit it to version control"
echo "2. Back up your master key in a secure location"
echo "3. If you lose the master key, encrypted documents cannot be recovered"
echo "4. Consider using environment variable management in production"
echo ""
echo "Next steps:"
echo "1. Restart your application: npm run dev"
echo "2. Test encryption: ./admin-encrypt.sh test-encryption"
echo "3. Check stats: ./admin-encrypt.sh stats"
echo ""
echo "Setup complete! 🔐"