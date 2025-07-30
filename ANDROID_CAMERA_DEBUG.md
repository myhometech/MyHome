# Android Camera Debug Instructions

## User Testing Steps:
1. **Check HTTPS**: Ensure using https:// URL (required for Android camera)
2. **Permission Check**: Look for browser permission dialog
3. **Browser Console**: Open developer tools and check console for errors
4. **Camera Busy**: Close other apps that might be using camera
5. **Browser Compatibility**: Try Chrome or Firefox on Android

## Developer Debug Steps:
1. **Console Logging**: Check for "✅ Android:" success messages
2. **Error Messages**: Look for specific Android error codes
3. **Fallback Testing**: Verify progressive fallback is working
4. **Network Check**: Confirm HTTPS certificate is valid

## Common Android Camera Issues:
- **HTTPS Required**: Android browsers require secure connection
- **Permission Denied**: User must allow camera access
- **Camera Busy**: Another app is using camera
- **Unsupported Browser**: Old Android browser versions
- **Hardware Issues**: Camera hardware malfunction

## Quick Fixes:
1. Refresh page and allow camera permission
2. Close other camera apps
3. Try different Android browser
4. Check HTTPS connection
5. Restart browser