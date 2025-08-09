/**
 * Authentication configuration
 * Centralized config for OAuth callbacks and environment-specific settings
 */

// Validate APP_ORIGIN on startup
function validateAppOrigin(origin: string | undefined): string {
  if (!origin) {
    throw new Error('APP_ORIGIN environment variable is required');
  }
  
  try {
    const url = new URL(origin);
    if (!url.protocol.startsWith('http')) {
      throw new Error('APP_ORIGIN must use http or https protocol');
    }
    return origin;
  } catch (error) {
    throw new Error(`Invalid APP_ORIGIN: ${origin}. Must be a valid absolute URL (e.g., http://localhost:5000 or https://myhome.app)`);
  }
}

export const APP_ORIGIN = validateAppOrigin(process.env.APP_ORIGIN);
export const CALLBACK_PATH = process.env.CALLBACK_PATH || '/auth/google/callback';
export const GOOGLE_CALLBACK_URL = new URL(CALLBACK_PATH, APP_ORIGIN).toString();

// Log configuration on startup
console.log(`🔧 Auth Config: APP_ORIGIN=${APP_ORIGIN}, CALLBACK_PATH=${CALLBACK_PATH}`);
console.log(`🔧 Google OAuth Callback URL: ${GOOGLE_CALLBACK_URL}`);