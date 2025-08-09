# Google OAuth Troubleshooting Guide

## Current Status
- **Date**: 2025-08-09
- **Issue**: redirect_uri_mismatch error from Google OAuth
- **Client ID**: 470933712389-1pmjsmg5u954mis75a7p1tph11hd7nmm.apps.googleusercontent.com
- **Required Redirect URI**: https://daf47820-7f0c-4127-926d-69f7ca178fbc-00-ku01l6bih555.kirk.replit.dev/api/auth/google/callback

## Verification Steps

### 1. Confirm Google Cloud Console Configuration
In Google Cloud Console > APIs & Services > Credentials:
- Find OAuth 2.0 Client ID: `470933712389-1pmjsmg5u954mis75a7p1tph11hd7nmm`
- Ensure exact URLs are listed:
  - **Authorized redirect URIs**: `https://daf47820-7f0c-4127-926d-69f7ca178fbc-00-ku01l6bih555.kirk.replit.dev/api/auth/google/callback`
  - **Authorized JavaScript origins**: `https://daf47820-7f0c-4127-926d-69f7ca178fbc-00-ku01l6bih555.kirk.replit.dev`

### 2. Common Issues
- **Multiple OAuth Clients**: Make sure you're editing the correct client ID
- **Propagation Delay**: Google changes can take 5-10 minutes to propagate
- **Trailing Slashes**: Ensure no trailing slashes in redirect URIs
- **HTTP vs HTTPS**: Must use HTTPS for production OAuth
- **Case Sensitivity**: URLs must match exactly

### 3. Alternative Solutions
If the issue persists:
1. Create a new OAuth 2.0 Client ID in Google Cloud Console
2. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in environment variables
3. Add the redirect URIs to the new client

### 4. Testing
Use this curl command to test if Google accepts the redirect URI:
```bash
curl -s "https://accounts.google.com/o/oauth2/v2/auth?response_type=code&redirect_uri=https%3A%2F%2Fdaf47820-7f0c-4127-926d-69f7ca178fbc-00-ku01l6bih555.kirk.replit.dev%2Fapi%2Fauth%2Fgoogle%2Fcallback&scope=profile%20email&client_id=470933712389-1pmjsmg5u954mis75a7p1tph11hd7nmm.apps.googleusercontent.com" | grep -i error
```

If no error appears, the OAuth is working.

## Technical Details
- All JavaScript lexical declaration conflicts have been resolved
- Authentication endpoints are working correctly (/api/auth/google returns 302)
- Session management is properly configured
- The issue is purely Google OAuth client configuration