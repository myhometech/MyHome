# Production White Screen Troubleshooting Guide

## Issue
Production deployment at https://myhome-docs.com shows white screen despite successful deployment.

## Root Cause Analysis

The white screen is likely caused by one of these issues:

### 1. Missing Environment Variables
**Required for production:**
```
DATABASE_URL=postgresql://...
SESSION_SECRET=your-secret-key
OPENAI_API_KEY=sk-...
```

**Optional but recommended:**
```
SENDGRID_API_KEY=SG...
STRIPE_SECRET_KEY=sk_...
GCS_PROJECT_ID=your-project
GCS_CREDENTIALS=base64-encoded-service-account
GCS_BUCKET_NAME=your-bucket
```

### 2. Security Headers Blocking Assets
The rate limiting and CORS policies might be too restrictive. Recent fixes:
- Rate limit increased to 500 requests/minute
- Static assets exempted from rate limiting
- CORS configured for production domains

### 3. Database Connection Failure
If the PostgreSQL database is unreachable, the app will fail to start properly.

### 4. Build Asset Issues
The production build creates files in `dist/public/` with these assets:
- `/assets/index-CqxgItsY.js` (1MB main bundle)
- `/assets/index-DdPLYbvI.css` (103KB styles)

## Debugging Steps

### Step 1: Check Browser Console
Open browser developer tools and check for:
- 404 errors for JS/CSS assets
- CORS errors
- Network timeout errors
- JavaScript runtime errors

### Step 2: Check Production Logs
Look for server startup errors:
- Database connection failures
- Missing environment variables
- Rate limiting blocks
- Asset serving issues

### Step 3: Test Production Endpoints
Test these URLs directly:
- `https://myhome-docs.com/api/health` - Should return health status
- `https://myhome-docs.com/assets/index-CqxgItsY.js` - Should return JS bundle
- `https://myhome-docs.com/assets/index-DdPLYbvI.css` - Should return CSS

### Step 4: Environment Variable Verification
Ensure all required environment variables are set in production:
```bash
# Check if DATABASE_URL is accessible
# Check if OPENAI_API_KEY is valid
# Verify SESSION_SECRET is configured
```

## Quick Fixes

### Fix 1: Rate Limiting (Already Applied)
```typescript
// server/middleware/security.ts
max: 500, // Increased from 100
// Static assets exempted from rate limiting
```

### Fix 2: CORS Configuration
Ensure production domain is whitelisted in CORS settings.

### Fix 3: Asset Path Resolution
The build outputs to `dist/public/` and the server should serve from this directory.

## Testing
After applying fixes:
1. Deploy the updated code
2. Test the health endpoint: `/api/health`
3. Check browser console for errors
4. Verify asset loading

## Build Verification
The production build is working correctly:
- ✅ Build completes without errors
- ✅ Assets generated in correct directory
- ✅ HTML references correct asset paths
- ✅ Bundle size is reasonable (1MB JS, 103KB CSS)

The issue is likely in the runtime environment, not the build process.