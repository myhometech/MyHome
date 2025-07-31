# Canny Integration Setup Guide

## Overview

This guide walks you through setting up Canny feedback integration for MyHome, enabling users to submit feedback directly from the support page with proper user attribution.

## Step 1: Create Canny Account and Project

### 1.1 Sign up for Canny
1. Go to [canny.io](https://canny.io)
2. Sign up for a free account
3. Choose the appropriate plan (free plan supports up to 100 monthly active users)

### 1.2 Create Your Project
1. Click "Create Board" or "New Board"
2. Enter project details:
   - **Board Name**: "MyHome Feedback"
   - **Board URL**: Choose a custom URL like `myhome-feedback` 
   - **Description**: "Feature requests, bug reports, and general feedback for MyHome document management"

### 1.3 Configure Board Settings
1. Go to Board Settings → General
2. Set visibility to "Public" (users can see others' feedback) or "Private" (only submitter sees their feedback)
3. Enable voting to allow users to upvote feature requests
4. Configure categories:
   - **Bug Reports**: For technical issues and bugs
   - **Feature Requests**: For new functionality suggestions  
   - **UI/UX Improvements**: For design and usability feedback
   - **Mobile App**: For mobile-specific feedback
   - **Performance**: For speed and performance issues

## Step 2: Get Your Canny Credentials

### 2.1 Board Token
1. In your Canny dashboard, go to Settings → General
2. Scroll to "Board Token" section
3. Copy the board token (format: `board_token_xxxxxxxxxxxxx`)

### 2.2 App ID  
1. Go to Settings → Developer
2. Find your "App ID" (format: `app_id_xxxxxxxxxxxxx`)
3. Copy this value

## Step 3: Configure Environment Variables

### 3.1 Add to .env file
```bash
# Canny Feedback Widget Configuration
VITE_CANNY_BOARD_TOKEN=board_token_xxxxxxxxxxxxx
VITE_CANNY_APP_ID=app_id_xxxxxxxxxxxxx
```

### 3.2 For Production/Replit Deployment
1. In Replit, go to Secrets tab
2. Add these environment variables:
   - Key: `VITE_CANNY_BOARD_TOKEN`, Value: your board token
   - Key: `VITE_CANNY_APP_ID`, Value: your app ID

## Step 4: Verify Integration

### 4.1 Test Widget Loading
1. Start your development server
2. Navigate to `/support` page
3. Click on "Submit Feedback" tab
4. Verify the Canny widget loads without errors

### 4.2 Test User Attribution
1. Log in to your MyHome account
2. Submit a test feedback item through the widget
3. Check your Canny dashboard to verify:
   - Feedback appears correctly
   - User information is properly attributed (name, email)
   - User ID matches your MyHome user ID

### 4.3 Test Fallback Mechanism
1. Temporarily set incorrect environment variables
2. Reload the support page
3. Verify fallback link appears with proper error message
4. Reset correct environment variables

## Step 5: Customize Canny Board (Optional)

### 5.1 Branding
1. Go to Settings → Branding
2. Upload your MyHome logo
3. Set brand colors to match MyHome theme:
   - Primary: `#3B82F6` (blue-500)
   - Secondary: `#6B7280` (gray-500)

### 5.2 Email Notifications
1. Go to Settings → Email
2. Configure notification preferences
3. Set up admin email alerts for new feedback

### 5.3 Custom Fields (Pro Feature)
Add custom fields to gather more context:
- **Document Type**: Select field for document-specific feedback
- **Feature Area**: Select field for UI sections (Upload, Insights, Search, etc.)
- **Priority**: Select field for urgency (Low, Medium, High)

## Step 6: Testing Checklist

- [ ] Canny widget loads on `/support` page
- [ ] User can submit feedback when authenticated
- [ ] User attribution works correctly (name, email, user ID)
- [ ] Feedback appears in Canny dashboard
- [ ] Fallback link works when widget fails
- [ ] Mobile responsive design works
- [ ] Error handling displays proper messages

## Step 7: Production Considerations

### 7.1 Security
- Board tokens are public (safe to expose in frontend)
- App IDs are public (safe to expose in frontend)
- User identification happens on frontend (secure by design)

### 7.2 Analytics
Canny provides built-in analytics:
- User engagement metrics
- Popular feature requests
- Feedback trends over time

### 7.3 Moderation
Set up moderation rules:
- Auto-approve feedback from verified users
- Flag spam or inappropriate content
- Merge duplicate requests

## Troubleshooting

### Widget Not Loading
- Check browser console for JavaScript errors
- Verify environment variables are set correctly
- Ensure Canny script loads from CDN
- Check network connectivity to canny.io

### User Attribution Issues
- Verify user is authenticated in MyHome
- Check user object has required fields (email, id, name)
- Ensure App ID is correct in environment variables

### Fallback Not Working  
- Verify fallback URL is accessible
- Check error handling logic in support component
- Test with different error scenarios

## Support Resources

- [Canny Documentation](https://developers.canny.io/)
- [Widget Configuration Guide](https://developers.canny.io/widget/setup)
- [User Identification API](https://developers.canny.io/api-reference#user_details_retrieve)
- [Canny Support](https://canny.io/help)

## Contact

For technical issues with the integration:
1. Check browser console for errors
2. Verify environment variables are set
3. Test with Canny's example code first
4. Contact Canny support for widget-specific issues