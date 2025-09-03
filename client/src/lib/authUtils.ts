export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}

// THMB-AUTH-HOTFIX: Centralized auth headers for session-based auth
export function getAuthHeaders(): Record<string, string> {
  // For session-based auth, we rely on cookies, but include proper headers
  // If we ever switch to JWT, we'd return Authorization: Bearer token here
  return {
    'Accept': 'application/json',
    'Cache-Control': 'no-cache'
  };
}