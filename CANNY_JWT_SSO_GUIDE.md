# Canny JWT SSO Integration Guide

## Overview

The Canny JWT SSO integration provides enhanced security for user authentication with Canny feedback widgets by using short-lived, signed JWT tokens instead of passing user data directly to the client.

## Benefits

- **Enhanced Security**: User data never exposed in client-side JavaScript
- **Secure Attribution**: JWT tokens ensure feedback is properly attributed to authenticated users
- **Short-lived Tokens**: 15-minute expiry minimizes security exposure
- **Backward Compatibility**: Falls back to session-based identification if JWT disabled

## Configuration

### Environment Variables

#### Required for Basic Canny Integration
```bash
VITE_CANNY_BOARD_TOKEN=board_token_xxxxxxxxxxxxx
VITE_CANNY_APP_ID=app_id_xxxxxxxxxxxxx
```

#### Optional for JWT SSO Enhancement
```bash
VITE_CANNY_USE_JWT=true
CANNY_JWT_SECRET=your_secure_jwt_secret_here
```

### Environment Setup

1. **Development (.env file)**:
   ```bash
   # Basic Canny Configuration
   VITE_CANNY_BOARD_TOKEN=board_token_xxxxxxxxxxxxx
   VITE_CANNY_APP_ID=app_id_xxxxxxxxxxxxx
   
   # Enable JWT SSO (optional)
   VITE_CANNY_USE_JWT=true
   CANNY_JWT_SECRET=your_super_secure_jwt_secret_key_here
   ```

2. **Replit Production**:
   - Go to Replit project → Secrets tab
   - Add all environment variables with their values
   - JWT secret should be a strong, random string (32+ characters)

## JWT Token Structure

### Token Payload
```json
{
  "id": "user_id_string",
  "email": "user@example.com",
  "name": "John Doe",
  "created": "2025-07-31T08:00:00.000Z",
  "role": "user",
  "iat": 1722412800,
  "exp": 1722413700,
  "iss": "myhome-app",
  "aud": "canny.io",
  "sub": "user_id_string"
}
```

### Security Features
- **Short Expiry**: 15 minutes (900 seconds)
- **Issuer**: `myhome-app` (validates token source)
- **Audience**: `canny.io` (validates intended recipient)
- **Subject**: User ID (for user identification)
- **Signed**: Using HS256 algorithm with `CANNY_JWT_SECRET`

## API Endpoints

### Generate JWT Token
```http
POST /api/canny-token
```

**Authentication**: Required (authenticated users only)

**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "user": {
    "id": "123",
    "email": "user@example.com", 
    "name": "John Doe"
  }
}
```

### Verify JWT Token (Debug/Testing)
```http
POST /api/canny-token/verify
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Response**:
```json
{
  "valid": true,
  "payload": {
    "id": "123",
    "email": "user@example.com",
    "name": "John Doe",
    "iat": 1722412800,
    "exp": 1722413700,
    "iss": "myhome-app",
    "aud": "canny.io"
  },
  "message": "Token is valid"
}
```

## Integration Modes

### Mode 1: JWT SSO (Enhanced Security)
When `VITE_CANNY_USE_JWT=true`:

1. Frontend requests JWT token from `/api/canny-token`
2. Backend generates signed JWT with user data
3. Frontend uses JWT token in `Canny('render', { ssoToken: token })`
4. Canny validates JWT and identifies user securely

### Mode 2: Session-based (Standard)
When `VITE_CANNY_USE_JWT=false` or not set:

1. Frontend uses session user data directly
2. Calls `Canny('identify', { user: userData })`
3. Standard Canny identification method

### Mode 3: Fallback
If JWT fails or configuration missing:

1. Shows error message to user
2. Provides direct link to Canny portal
3. Graceful degradation ensures functionality

## Implementation Details

### Backend (Node.js/Express)
```typescript
// Generate JWT token
router.post('/canny-token', requireAuth, async (req, res) => {
  const user = req.user;
  const jwtSecret = process.env.CANNY_JWT_SECRET || process.env.SESSION_SECRET;
  
  const payload = {
    id: user.id.toString(),
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim() || user.email,
    created: user.createdAt || new Date().toISOString(),
    role: user.role || 'user',
    iat: Math.floor(Date.now() / 1000),
  };

  const token = jwt.sign(payload, jwtSecret, {
    expiresIn: '15m',
    issuer: 'myhome-app',
    audience: 'canny.io',
    subject: user.id.toString(),
  });

  res.json({ token, expiresIn: 900, user: { id: user.id, email: user.email, name: payload.name } });
});
```

### Frontend (React/TypeScript)
```typescript
// Fetch JWT token and initialize Canny
const getCannyToken = async () => {
  const response = await fetch('/api/canny-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  });
  
  if (response.ok) {
    const data = await response.json();
    return data.token;
  }
  return null;
};

// Initialize Canny with JWT or fallback
const useJWT = import.meta.env.VITE_CANNY_USE_JWT === 'true';
let ssoToken = null;

if (useJWT && user) {
  ssoToken = await getCannyToken();
}

window.Canny('render', {
  boardToken: cannyBoardToken,
  ssoToken: ssoToken, // Use JWT if available
});
```

## Testing

### Automated Test Suite
Run the comprehensive test suite:
```bash
node test-canny-jwt-sso.js
```

Tests validate:
- ✅ Backend JWT route implementation
- ✅ Routes integration
- ✅ Frontend JWT integration
- ✅ Environment configuration
- ✅ Security features
- ✅ Package dependencies

### Manual Testing

1. **JWT Token Generation**:
   ```bash
   curl -X POST http://localhost:5000/api/canny-token \
     -H "Content-Type: application/json" \
     -b "connect.sid=your_session_cookie"
   ```

2. **JWT Token Verification**:
   ```bash
   curl -X POST http://localhost:5000/api/canny-token/verify \
     -H "Content-Type: application/json" \
     -b "connect.sid=your_session_cookie" \
     -d '{"token":"your_jwt_token_here"}'
   ```

3. **Frontend Testing**:
   - Login to application
   - Navigate to Support page
   - Check browser console for JWT token retrieval
   - Verify Canny widget loads with proper user identification

## Troubleshooting

### Common Issues

1. **JWT Token Generation Fails**:
   - Check `CANNY_JWT_SECRET` is set in environment
   - Verify user is authenticated (session valid)
   - Check server logs for JWT signing errors

2. **Frontend JWT Request Fails**:
   - Ensure `VITE_CANNY_USE_JWT=true` is set
   - Check network tab for 401/403 errors
   - Verify session cookies are included in request

3. **Canny Widget Not Loading**:
   - Check `VITE_CANNY_BOARD_TOKEN` and `VITE_CANNY_APP_ID` are set
   - Verify Canny script loads successfully
   - Check browser console for Canny initialization errors

4. **Token Validation Fails**:
   - Verify JWT secret matches between generation and verification
   - Check token hasn't expired (15-minute limit)
   - Ensure issuer/audience values match expected values

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=canny:*
```

This will show detailed logs for:
- JWT token generation and validation
- Canny script loading and initialization
- User identification and SSO token usage

## Security Considerations

1. **JWT Secret Management**:
   - Use strong, randomly generated secrets (32+ characters)
   - Never commit secrets to version control
   - Rotate secrets periodically in production

2. **Token Expiry**:
   - Short 15-minute expiry minimizes exposure
   - Tokens automatically regenerated on each Support page visit
   - No token persistence in client storage

3. **Authentication Requirements**:
   - JWT tokens only issued to authenticated users
   - Backend validates session before token generation
   - Proper error handling prevents token leakage

4. **Network Security**:
   - Use HTTPS in production
   - Secure cookie settings for sessions
   - Proper CORS configuration

## Production Deployment

1. **Environment Setup**:
   - Set all required environment variables
   - Use strong JWT secret (generate with `openssl rand -base64 32`)
   - Configure proper HTTPS certificates

2. **Monitoring**:
   - Monitor JWT token generation rates
   - Track authentication failures
   - Set up alerts for high error rates

3. **Backup Strategy**:
   - Fallback to session-based identification if JWT fails
   - Direct Canny portal links as final fallback
   - Graceful error handling prevents complete failure

## Advanced Configuration

### Custom JWT Claims
Add custom claims to JWT payload:
```typescript
const payload = {
  // ... standard claims
  customField: 'custom_value',
  userTier: user.subscriptionTier,
  lastLogin: user.lastLoginAt,
};
```

### Token Refresh
Implement automatic token refresh:
```typescript
// Refresh token before expiry
setTimeout(async () => {
  const newToken = await getCannyToken();
  // Update Canny with new token if needed
}, 13 * 60 * 1000); // 13 minutes (2 minutes before expiry)
```

### Multiple Canny Boards
Support multiple boards with board-specific tokens:
```typescript
const getBoardToken = async (boardId) => {
  const response = await fetch(`/api/canny-token/${boardId}`, {
    method: 'POST',
    credentials: 'include',
  });
  return response.json();
};
```

## Conclusion

The JWT SSO integration provides enterprise-grade security for Canny feedback attribution while maintaining full backward compatibility. The implementation is production-ready with comprehensive testing, error handling, and fallback mechanisms.

For additional support or advanced configuration needs, refer to the Canny documentation or submit feedback through the integrated support system.