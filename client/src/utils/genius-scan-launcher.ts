/**
 * Genius Scan App Integration Utility
 * Handles launching Genius Scan app on different platforms with fallbacks
 */

export interface GeniusScanConfig {
  // iOS App Store link
  iosAppStoreUrl: string;
  // Android Play Store link
  androidPlayStoreUrl: string;
  // URL scheme for launching the app
  urlScheme: string;
  // Android package name for Intent
  androidPackageName: string;
}

export const GENIUS_SCAN_CONFIG: GeniusScanConfig = {
  iosAppStoreUrl: 'https://apps.apple.com/app/genius-scan-pdf-scanner/id377672876',
  androidPlayStoreUrl: 'https://play.google.com/store/apps/details?id=com.thegrizzlylabs.geniusscan.free',
  urlScheme: 'geniusscan://',
  androidPackageName: 'com.thegrizzlylabs.geniusscan.free'
};

/**
 * Detects the current platform
 */
export function detectPlatform(): 'ios' | 'android' | 'web' {
  const userAgent = navigator.userAgent.toLowerCase();
  
  if (/iphone|ipad|ipod/.test(userAgent)) {
    return 'ios';
  }
  
  if (/android/.test(userAgent)) {
    return 'android';
  }
  
  return 'web';
}

/**
 * Attempts to launch Genius Scan app, with fallback to app store
 */
export async function launchGeniusScan(): Promise<{ success: boolean; action: 'launched' | 'app_store' | 'failed'; message: string }> {
  const platform = detectPlatform();
  
  try {
    switch (platform) {
      case 'ios':
        return await launchGeniusScanIOS();
      
      case 'android':
        return await launchGeniusScanAndroid();
      
      default:
        // Web fallback - show instructions
        return {
          success: false,
          action: 'failed',
          message: 'Genius Scan integration is available on mobile devices. Please use your phone or tablet to scan documents.'
        };
    }
  } catch (error) {
    console.error('Failed to launch Genius Scan:', error);
    return {
      success: false,
      action: 'failed',
      message: 'Unable to launch Genius Scan. Please try again or download the app manually.'
    };
  }
}

/**
 * iOS implementation using URL scheme
 */
async function launchGeniusScanIOS(): Promise<{ success: boolean; action: 'launched' | 'app_store'; message: string }> {
  return new Promise((resolve) => {
    // Track if we successfully launched the app
    let appLaunched = false;
    
    // Create a hidden iframe to attempt the URL scheme
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = GENIUS_SCAN_CONFIG.urlScheme;
    document.body.appendChild(iframe);
    
    // Clean up iframe after attempt
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
    
    // Set a timer to check if app launched
    const timer = setTimeout(() => {
      if (!appLaunched) {
        // App didn't launch, redirect to App Store
        window.open(GENIUS_SCAN_CONFIG.iosAppStoreUrl, '_blank');
        resolve({
          success: true,
          action: 'app_store',
          message: 'Genius Scan not found. Redirecting to App Store to download.'
        });
      }
    }, 2500);
    
    // Listen for page visibility change (indicates app launched)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        appLaunched = true;
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        resolve({
          success: true,
          action: 'launched',
          message: 'Genius Scan launched successfully!'
        });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also try direct window location as backup
    setTimeout(() => {
      if (!appLaunched) {
        try {
          window.location.href = GENIUS_SCAN_CONFIG.urlScheme;
        } catch (e) {
          // Ignore errors from URL scheme attempts
        }
      }
    }, 500);
  });
}

/**
 * Android implementation using Intent
 */
async function launchGeniusScanAndroid(): Promise<{ success: boolean; action: 'launched' | 'app_store'; message: string }> {
  return new Promise((resolve) => {
    let appLaunched = false;
    
    // Try Android Intent first
    const intentUrl = `intent://scan#Intent;scheme=geniusscan;package=${GENIUS_SCAN_CONFIG.androidPackageName};end`;
    
    // Create hidden iframe for Intent
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = intentUrl;
    document.body.appendChild(iframe);
    
    // Clean up iframe
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 1000);
    
    // Fallback to Play Store if app not launched
    const timer = setTimeout(() => {
      if (!appLaunched) {
        window.open(GENIUS_SCAN_CONFIG.androidPlayStoreUrl, '_blank');
        resolve({
          success: true,
          action: 'app_store',
          message: 'Genius Scan not found. Redirecting to Google Play Store to download.'
        });
      }
    }, 2500);
    
    // Listen for page visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        appLaunched = true;
        clearTimeout(timer);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        resolve({
          success: true,
          action: 'launched',
          message: 'Genius Scan launched successfully!'
        });
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Also try the URL scheme as backup
    setTimeout(() => {
      if (!appLaunched) {
        try {
          window.location.href = GENIUS_SCAN_CONFIG.urlScheme;
        } catch (e) {
          // Try plain intent URL as final fallback
          try {
            window.location.href = intentUrl;
          } catch (e2) {
            // Ignore errors
          }
        }
      }
    }, 500);
  });
}

/**
 * Shows installation prompt for Genius Scan
 */
export function showGeniusScanInstallPrompt(platform: 'ios' | 'android' | 'web' = detectPlatform()): string {
  const config = GENIUS_SCAN_CONFIG;
  
  switch (platform) {
    case 'ios':
      return `To scan documents, please install Genius Scan from the App Store: ${config.iosAppStoreUrl}`;
    
    case 'android':
      return `To scan documents, please install Genius Scan from Google Play: ${config.androidPlayStoreUrl}`;
    
    default:
      return 'Genius Scan is available on iOS and Android devices. Please use your mobile device to scan documents.';
  }
}