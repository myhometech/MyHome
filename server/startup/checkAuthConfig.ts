/**
 * AUTH-324: Configuration guardrails and startup validation
 * Prevents OAuth misconfigurations from being deployed
 */

import { APP_ORIGIN, CALLBACK_PATH, GOOGLE_CALLBACK_URL } from '../config/auth.js';

/**
 * Environment Matrix - Single source of truth for validation
 */
const ENVIRONMENT_MATRIX = {
  'http://localhost:5000': 'http://localhost:5000/auth/google/callback',
  'https://staging.myhome-docs.com': 'https://staging.myhome-docs.com/auth/google/callback',
  'https://myhome-docs.com': 'https://myhome-docs.com/auth/google/callback'
} as const;

/**
 * Validates OAuth configuration on startup
 * Exits process with error if configuration is invalid
 */
export function validateAuthConfig(): void {
  const expectedCallback = new URL(CALLBACK_PATH, APP_ORIGIN).toString();
  
  console.log(`🔧 [AUTH-324] Validating OAuth configuration...`);
  console.log(`🔧 NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`🔧 APP_ORIGIN: ${APP_ORIGIN}`);
  console.log(`🔧 CALLBACK_PATH: ${CALLBACK_PATH}`);
  console.log(`🔧 Expected Callback: ${expectedCallback}`);
  console.log(`🔧 Actual Callback: ${GOOGLE_CALLBACK_URL}`);

  // Verify callback URL construction matches expectation
  if (expectedCallback !== GOOGLE_CALLBACK_URL) {
    console.error(`❌ [FATAL] OAuth callback URL mismatch!`);
    console.error(`❌ Expected: ${expectedCallback}`);
    console.error(`❌ Got: ${GOOGLE_CALLBACK_URL}`);
    console.error(`❌ This indicates a configuration error that would cause OAuth failures.`);
    process.exit(1);
  }

  // Verify against environment matrix for known environments
  const matrixCallback = ENVIRONMENT_MATRIX[APP_ORIGIN as keyof typeof ENVIRONMENT_MATRIX];
  if (matrixCallback && matrixCallback !== GOOGLE_CALLBACK_URL) {
    console.error(`❌ [FATAL] OAuth callback does not match environment matrix!`);
    console.error(`❌ APP_ORIGIN: ${APP_ORIGIN}`);
    console.error(`❌ Matrix expects: ${matrixCallback}`);
    console.error(`❌ Got: ${GOOGLE_CALLBACK_URL}`);
    console.error(`❌ Update environment matrix in server/startup/checkAuthConfig.ts if this is intentional.`);
    process.exit(1);
  }

  // Validate URL structure
  try {
    new URL(GOOGLE_CALLBACK_URL);
  } catch (error) {
    console.error(`❌ [FATAL] Invalid OAuth callback URL format: ${GOOGLE_CALLBACK_URL}`);
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }

  // Validate APP_ORIGIN structure
  try {
    const origin = new URL(APP_ORIGIN);
    if (!origin.protocol.startsWith('http')) {
      throw new Error('APP_ORIGIN must use http or https protocol');
    }
  } catch (error) {
    console.error(`❌ [FATAL] Invalid APP_ORIGIN format: ${APP_ORIGIN}`);
    console.error(`❌ Error: ${error}`);
    process.exit(1);
  }

  console.log(`✅ [AUTH-324] OAuth configuration validation passed`);
}

/**
 * Gets the expected callback URL for the current environment
 * Used for testing and validation
 */
export function getExpectedCallback(): string {
  return new URL(CALLBACK_PATH, APP_ORIGIN).toString();
}

/**
 * Checks if current environment is in the known matrix
 */
export function isKnownEnvironment(): boolean {
  return APP_ORIGIN in ENVIRONMENT_MATRIX;
}