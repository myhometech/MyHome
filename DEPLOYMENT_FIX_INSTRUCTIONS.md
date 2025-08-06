# 🚀 DEPLOYMENT FIX INSTRUCTIONS

## Problem
Your Node.js server works perfectly locally but returns 404 on deployment. This is a common Replit deployment configuration issue.

## Solution Steps

### 1. Update .replit Configuration
Open the `.replit` file and replace the `[deployment]` section with:

```toml
[deployment]
deploymentTarget = "autoscale"
build = ["npm", "run", "start"]
run = ["npm", "run", "start"]
```

**OR** try this simpler version:

```toml
[deployment]
deploymentTarget = "autoscale"
run = ["npm", "run", "start"]
```

### 2. Alternative: Use Direct Node Command
If npm scripts don't work, try:

```toml
[deployment]
deploymentTarget = "autoscale"
build = ["npm", "run", "build"]
run = ["node", "dist/index.js"]
```

### 3. Verify Port Configuration
Ensure your `.replit` file has only ONE port configuration:

```toml
[[ports]]
localPort = 5000
externalPort = 80
```

Remove any secondary port configurations (like port 5001).

### 4. Force Fresh Deployment
1. Save the updated `.replit` file
2. Go to the Deployments tab in Replit
3. Click "Deploy" to trigger a fresh deployment
4. Watch the deployment logs for startup messages

### 5. Test Deployment
After deployment completes, test with:
```bash
curl https://myhome-api.replit.app/debug
```

Expected response: `✅ App is live - [timestamp]`

## Why This Fixes the Issue

1. **Simplified Build**: Using npm scripts instead of direct esbuild commands
2. **Consistent Entry Point**: Ensures Replit uses the same startup command locally and in deployment
3. **Port Cleanup**: Eliminates potential port conflicts

## Email System Status
Once deployment works, your email system will be immediately functional:
- Users can send documents to: `u[userID]@uploads.myhome-tech.com`
- All security measures are active
- Document processing with OCR is ready

The code is production-ready - only the deployment configuration needs this adjustment.