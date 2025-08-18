# GCS Permissions Fix Required

## Issue Summary
The GCS bucket migration to `myhometech-eu` is **technically complete** but failing due to IAM permissions. The service account `myhome-storage-access-493@myhome-467408.iam.gserviceaccount.com` lacks the necessary permissions for the new bucket.

## Error Details
- **Service Account**: `myhome-storage-access-493@myhome-467408.iam.gserviceaccount.com`
- **Project ID**: `myhome-467408`
- **New Bucket**: `myhometech-eu` (EUROPE-WEST2 region)
- **Missing Permissions**: 
  - `storage.objects.create` (for uploads)
  - `storage.objects.get` (for downloads)
  - `storage.objects.delete` (for cleanup)

## Current Status
✅ **Migration Complete**: All 144 files successfully migrated from `myhometech-storage` to `myhometech-eu`
✅ **Bucket Configuration**: App correctly configured to use `myhometech-eu`
✅ **Code Updates**: All services updated to use new bucket
❌ **IAM Permissions**: Service account lacks permissions for new bucket

## Required Fix (Google Cloud Console)

### Option 1: Grant Bucket-Level Permissions (Recommended)
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Storage > Browser**
3. Click on the `myhometech-eu` bucket
4. Go to **Permissions** tab
5. Click **Grant Access**
6. Add the service account: `myhome-storage-access-493@myhome-467408.iam.gserviceaccount.com`
7. Grant role: **Storage Object Admin** or **Storage Admin**

### Option 2: Update Project-Level IAM (Alternative)
1. Go to **IAM & Admin > IAM**
2. Find the service account: `myhome-storage-access-493@myhome-467408.iam.gserviceaccount.com`
3. Edit permissions and ensure it has **Storage Admin** role

## Verification Command
After fixing permissions, run this to verify:
```bash
node test-current-flow.js
```

## Files Currently Affected
- Any new document uploads will fail
- Document downloads may fail for recently uploaded files
- Email-to-PDF conversions will fail
- OCR processing uploads will fail

## Migration Success Summary
✅ Environment variables updated (`GCS_BUCKET_NAME=myhometech-eu`)
✅ All hardcoded bucket references updated in code
✅ Backup service correctly uses separate `myhometech-backups` bucket  
✅ 144 existing files migrated successfully
✅ New EU bucket confirmed accessible (EUROPE-WEST2 region)
✅ Application configuration complete

**The migration is technically complete - only IAM permissions need to be fixed in Google Cloud Console.**