# Android Camera Troubleshooting Guide

## Quick Fix Steps (For Users)

### 1. Check Your Connection
- **Must use HTTPS**: Camera requires `https://` URL on Android
- If using HTTP, you'll see: "Camera requires HTTPS connection on Android devices"
- Solution: Use the secure HTTPS version of the website

### 2. Allow Camera Permission
- When prompted, tap "Allow" for camera access
- If you previously denied, go to browser settings and enable camera for this site
- Clear browser data if permission seems stuck

### 3. Check Camera Availability
- Close other apps that might be using your camera (WhatsApp, Instagram, camera app)
- Make sure your camera isn't being used by video calls or other browser tabs
- Restart your browser if camera appears busy

### 4. Browser Compatibility
- **Recommended**: Chrome or Firefox on Android
- Avoid older browser versions
- Update your browser if camera doesn't work

## Technical Debugging

### Console Messages to Look For

**Success Messages:**
- `✅ Android: Back camera initialized successfully`
- `✅ Android: Fallback camera initialized`  
- `✅ Android: Minimal camera constraints successful`
- `✅ Android: Boolean video constraint successful`

**Error Messages:**
- `🔄 Android: Back camera failed, trying fallback:`
- `🔄 Android: Fallback failed, trying minimal constraints:`
- `Camera requires HTTPS connection on Android devices`

### Progressive Fallback System

The camera tries these constraints in order:

1. **Android-Optimized** (1280x720, back camera, 30fps)
2. **Flexible Fallback** (flexible resolution, any camera)
3. **Minimal Constraints** (320x240 minimum)
4. **Boolean Only** (basic video: true)

### Common Android Issues & Solutions

| Issue | Error Type | Solution |
|-------|------------|----------|
| HTTPS Required | `Camera requires HTTPS` | Use https:// URL |
| Permission Denied | `NotAllowedError` | Allow camera in browser |
| No Camera Found | `NotFoundError` | Check hardware, try different browser |
| Camera Busy | `NotReadableError` | Close other camera apps |
| Unsupported Browser | `NotSupportedError` | Update browser or try Chrome |

## Developer Debug Commands

Open browser console and check for:

```javascript
// Check camera availability
navigator.mediaDevices.getUserMedia({video: true})
  .then(stream => console.log('Camera OK:', stream))
  .catch(err => console.log('Camera Error:', err));

// Check HTTPS
console.log('Protocol:', location.protocol);
console.log('HTTPS Required:', location.protocol !== 'https:' && location.hostname !== 'localhost');
```

## Advanced Troubleshooting

### 1. Clear Browser Data
- Settings → Privacy → Clear browsing data
- Include: Cookies, cached files, site permissions
- Restart browser after clearing

### 2. Test in Incognito/Private Mode
- Opens fresh session without cached permissions
- Helps identify permission-related issues

### 3. Try Different Android Browsers
- Chrome (recommended)
- Firefox
- Samsung Internet
- Avoid: older WebView-based browsers

### 4. Check Device Camera
- Test camera in default camera app
- Ensure hardware is functioning
- Check if other apps can access camera

## Error Recovery

If camera still doesn't work:

1. **Fallback Upload**: Use file picker instead of camera
2. **Desktop Alternative**: Try on desktop computer
3. **Different Device**: Test on another Android device
4. **Report Issue**: Contact support with console error messages

## Prevention

- Always use HTTPS for camera features
- Keep browser updated
- Allow camera permissions when prompted
- Close unnecessary apps before scanning

## Contact Support

If issues persist, provide:
- Android version
- Browser type and version
- Console error messages
- Steps that led to the error
- Whether HTTPS is being used