# MyHome Document Encryption Setup Guide

## Overview

MyHome now includes enterprise-grade AES-256-GCM encryption for all documents. Every document is automatically encrypted at rest with unique per-document keys, providing maximum security for your sensitive files.

## Features

- **AES-256-GCM Encryption**: Industry-standard encryption with authentication
- **Per-Document Keys**: Each document has a unique 256-bit encryption key
- **Master Key Protection**: Document keys are encrypted with a master key
- **Transparent Operation**: Encryption/decryption happens automatically
- **Performance Optimized**: Streaming encryption/decryption for large files
- **Secure Key Management**: Master keys stored in environment variables only

## Quick Setup

### 1. Generate Master Key

Run the setup script to generate a secure master key:

```bash
./setup-encryption.sh
```

This will:
- Generate a 256-bit master encryption key
- Save it to your `.env` file as `DOCUMENT_MASTER_KEY`
- Provide security recommendations

### 2. Restart Application

Restart your application to load the new encryption key:

```bash
npm run dev
```

### 3. Test Encryption (Optional)

Test that encryption is working correctly:

```bash
./admin-encrypt.sh test-encryption
```

## How It Works

### Document Upload Process

1. **File Upload**: User uploads a document through the web interface
2. **Key Generation**: System generates a unique 256-bit key for the document
3. **File Encryption**: Document is encrypted with AES-256-GCM using the document key
4. **Key Encryption**: Document key is encrypted with the master key
5. **Database Storage**: Encrypted file path and encrypted key are stored in database
6. **File Cleanup**: Original unencrypted file is removed

### Document Access Process

1. **User Request**: User clicks to view/download a document
2. **Authentication**: System verifies user owns the document
3. **Key Decryption**: Document key is decrypted using the master key
4. **File Decryption**: Document is decrypted using the document key
5. **Streaming Delivery**: Decrypted content is streamed to user browser

## Security Features

### Encryption Algorithm
- **Cipher**: AES-256-GCM
- **Key Size**: 256 bits (32 bytes)
- **Authentication**: Built-in authenticated encryption
- **IV/Nonce**: Unique for each encryption operation

### Key Management
- **Master Key**: 256-bit key stored in environment variable
- **Document Keys**: Unique per document, encrypted at rest
- **No Client Exposure**: Keys never sent to browser/client
- **Secure Generation**: Cryptographically secure random generation

### File Security
- **At-Rest Encryption**: All files encrypted on disk
- **In-Transit Protection**: HTTPS for data transmission
- **Access Control**: Document-level permissions enforced
- **Automatic Cleanup**: Temporary files securely deleted

## Admin Management

### Check Encryption Status

```bash
./admin-encrypt.sh stats
```

Shows:
- Total documents in system
- Number of encrypted documents
- Encryption percentage
- Master key status

### Test Encryption System

```bash
./admin-encrypt.sh test-encryption
```

Performs:
- Key generation test
- Encryption/decryption test
- File integrity verification
- Performance benchmarks

### Validate Setup

```bash
./admin-encrypt.sh validate
```

Checks:
- Master key presence and format
- Database schema compatibility
- File system permissions
- Encryption service functionality

### Key Rotation (Advanced)

```bash
./admin-encrypt.sh rotate-keys
```

⚠️ **Warning**: This is a destructive operation that re-encrypts all documents with new keys. Use with caution.

## Environment Variables

### Required Variables

```bash
DOCUMENT_MASTER_KEY=your-256-bit-hex-key-here
DATABASE_URL=postgresql://...
```

### Optional Variables

```bash
NODE_ENV=production
SESSION_SECRET=your-session-secret
```

## Migration Guide

### Existing Documents

If you have existing unencrypted documents, they will:
- Continue to work normally (backward compatibility)
- Be migrated to encrypted storage on next access
- Show in admin stats as "unencrypted" until migrated

### New Installations

All new documents are automatically encrypted from the first upload.

## Troubleshooting

### Common Issues

**Error: "Document encryption failed"**
- Check that `DOCUMENT_MASTER_KEY` is set correctly
- Verify key is 64 hex characters (256 bits)
- Ensure write permissions to uploads directory

**Error: "Failed to decrypt document"**
- Master key may have changed
- Database corruption possible
- Contact support with document ID

**Slow Performance**
- Large files take time to encrypt/decrypt
- Consider upgrading server resources
- Check disk space availability

### Recovery Options

**Lost Master Key**
- Encrypted documents cannot be recovered
- Keep secure backups of your master key
- Consider key escrow for enterprise deployments

**Database Issues**
- Encryption metadata is stored in database
- Regular database backups are essential
- Schema migrations may be required

## Security Best Practices

### Production Deployment

1. **Environment Security**
   - Use environment variable management systems
   - Never commit master keys to version control
   - Rotate keys regularly (quarterly recommended)

2. **Access Control**
   - Limit admin access to encryption management
   - Use separate encryption keys per environment
   - Monitor encryption statistics regularly

3. **Backup Strategy**
   - Include encrypted files in backups
   - Store master keys separately from data
   - Test restoration procedures regularly

### Development Environment

1. **Key Management**
   - Use different keys for development/production
   - Never share development keys
   - Regenerate keys when team members leave

2. **Testing**
   - Test encryption with various file types
   - Verify performance with large files
   - Validate error handling scenarios

## API Reference

### Admin Endpoints

```bash
GET /api/admin/encryption/stats
POST /api/admin/encryption/test
```

Requires admin authentication.

### Document Endpoints

All existing document endpoints continue to work:
- Upload: `POST /api/documents`
- Download: `GET /api/documents/:id/download`
- Preview: `GET /api/documents/:id/preview`

Encryption/decryption is transparent to clients.

## Support

For technical support with encryption setup:

1. Check this guide for common solutions
2. Run diagnostic commands provided
3. Contact development team with specific error messages
4. Include encryption stats and system information

## Compliance

This encryption implementation supports:
- **GDPR**: Right to deletion with secure key destruction
- **HIPAA**: Encryption at rest requirements
- **SOC 2**: Data security controls
- **ISO 27001**: Information security management

Document your encryption setup and key management procedures for compliance audits.