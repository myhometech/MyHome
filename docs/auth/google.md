# Google OAuth Configuration

## Environment Variables

The following environment variables are required for Google OAuth to function correctly:

### Required Variables

- `GOOGLE_CLIENT_ID`: Your Google OAuth client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret from Google Cloud Console  
- `APP_ORIGIN`: The absolute base URL of your application

### Optional Variables

- `CALLBACK_PATH`: The callback path for OAuth (default: `/auth/google/callback`)

## Environment Matrix (AUTH-323)

**Single Source of Truth** for OAuth URIs per environment. Google Cloud Console settings must match exactly:

| Environment | APP_ORIGIN | Authorized JavaScript Origins | Authorized Redirect URIs |
|-------------|------------|------------------------------|--------------------------|
| Local       | `http://localhost:5000` | `http://localhost:5000` | `http://localhost:5000/auth/google/callback` |
| Staging     | `https://staging.myhome-docs.com` | `https://staging.myhome-docs.com` | `https://staging.myhome-docs.com/auth/google/callback` |
| Production  | `https://myhome-docs.com` | `https://myhome-docs.com` | `https://myhome-docs.com/auth/google/callback` |

## Google Cloud Console Setup Process (AUTH-323)

**Step-by-step configuration procedure:**

1. **Navigate to Google Cloud Console**
   - Go to **APIs & Services → Credentials → [OAuth 2.0 Client IDs] → Web client**

2. **Update Authorized JavaScript Origins**
   - Set **exactly** the origins from the matrix above (one per line)
   - Remove any extra or legacy entries
   
3. **Update Authorized Redirect URIs**
   - Set **exactly** the callback URIs from the matrix above (one per line)
   - Remove any stale/duplicate entries

4. **Clean Up Legacy Entries**
   - Remove old subdomains, ports, or HTTP where HTTPS is required
   - Ensure **no trailing slashes** on any entries

5. **Save and Publish**
   - Save changes in Google Cloud Console
   - Re-publish OAuth consent screen if prompted

### Configuration Notes

- **No trailing slashes** on any URLs
- **Exact scheme/host/port** must match between environment and Google Console  
- Callback path comes from `CALLBACK_PATH` (default `/auth/google/callback`)
- Remove **all** entries not listed in the matrix to prevent ambiguous matches

## OAuth Security Features

### CSRF Protection with State Parameter

The application implements OAuth `state` parameter for CSRF protection:

1. **State Generation**: Each login generates a unique state value using `crypto.randomUUID()`
2. **Session Storage**: State is stored server-side in PostgreSQL-backed sessions
3. **Verification**: Callback verifies the state parameter matches the stored value
4. **Single Use**: State is cleared after use to prevent replay attacks

### Error Handling

- `?error=google`: General Google OAuth failure
- `?error=state_mismatch`: CSRF protection triggered (state parameter mismatch)

## Configuration Validation

The application validates configuration on startup:

1. **APP_ORIGIN** must be present and a valid absolute URL (or defaults to `http://localhost:5000` in development)
2. **GOOGLE_CLIENT_ID** and **GOOGLE_CLIENT_SECRET** must be present
3. Application will fail to start if any required variables are missing

## Troubleshooting

### Common Issues:

1. **redirect_uri_mismatch**: The callback URL in Google Console doesn't match your `APP_ORIGIN + CALLBACK_PATH`
   - **Solution**: Verify Google Console entries match the Environment Matrix exactly
   - **Check**: Remove any stale entries not in the matrix
2. **invalid_request**: Missing or invalid `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
3. **Configuration error on startup**: Invalid or missing `APP_ORIGIN`
4. **state_mismatch**: CSRF protection triggered - usually indicates:
   - Session store connectivity issues
   - Cookie configuration problems (domain/path/sameSite)
   - User manually modified the callback URL
   - Potential CSRF attack attempt

### Validation Checklist (AUTH-323)

For each environment, verify:

- [ ] `APP_ORIGIN` environment variable matches the matrix
- [ ] Google Console **Authorized JavaScript Origins** contains only the matrix entry for that environment
- [ ] Google Console **Authorized Redirect URIs** contains only the matrix callback URL for that environment
- [ ] No trailing slashes on any entries
- [ ] All legacy/extra entries removed from Google Console

### Debug Information:

The application logs the following on startup:
```
🔧 Auth Config: APP_ORIGIN=http://localhost:5000, CALLBACK_PATH=/auth/google/callback
🔧 Google OAuth Callback URL: http://localhost:5000/auth/google/callback
```

And during OAuth flow:
```
🔐 auth.login.start - provider: google, redirect_uri host: localhost:5000, path: /auth/google/callback, state_set: true
🔐 auth.login.success - provider: google, redirect_uri host: localhost:5000, user: [user-id]
🔐 auth.login.error - provider: google, code: state_mismatch, expected: true, received: true, redirect_uri host: localhost:5000
```