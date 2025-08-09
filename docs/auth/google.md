# Google OAuth Configuration

## Environment Variables

The following environment variables are required for Google OAuth to function correctly:

### Required Variables

- `GOOGLE_CLIENT_ID`: Your Google OAuth client ID from Google Cloud Console
- `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret from Google Cloud Console  
- `APP_ORIGIN`: The absolute base URL of your application

### Optional Variables

- `CALLBACK_PATH`: The callback path for OAuth (default: `/auth/google/callback`)

## Environment Matrix

| Environment | APP_ORIGIN Example | Full Callback URL |
|-------------|-------------------|-------------------|
| **Local Development** | `http://localhost:5000` | `http://localhost:5000/auth/google/callback` |
| **Staging** | `https://staging.myhome.app` | `https://staging.myhome.app/auth/google/callback` |
| **Production** | `https://myhome.app` | `https://myhome.app/auth/google/callback` |

## Google Cloud Console Setup

In your Google Cloud Console OAuth client configuration, add these **Authorized redirect URIs**:

### For All Environments:
```
http://localhost:5000/auth/google/callback
https://[your-repl-name].[username].replit.app/auth/google/callback
https://staging.myhome.app/auth/google/callback
https://myhome.app/auth/google/callback
```

### Authorized JavaScript Origins:
```
http://localhost:5000
https://[your-repl-name].[username].replit.app
https://staging.myhome.app
https://myhome.app
```

## Configuration Validation

The application validates configuration on startup:

1. **APP_ORIGIN** must be present and a valid absolute URL
2. **GOOGLE_CLIENT_ID** and **GOOGLE_CLIENT_SECRET** must be present
3. Application will fail to start if any required variables are missing

## Troubleshooting

### Common Issues:

1. **redirect_uri_mismatch**: The callback URL in Google Console doesn't match your `APP_ORIGIN + CALLBACK_PATH`
2. **invalid_request**: Missing or invalid `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
3. **Configuration error on startup**: Invalid or missing `APP_ORIGIN`

### Debug Information:

The application logs the following on startup:
```
🔧 Auth Config: APP_ORIGIN=http://localhost:5000, CALLBACK_PATH=/auth/google/callback
🔧 Google OAuth Callback URL: http://localhost:5000/auth/google/callback
```

And during OAuth flow:
```
🔐 auth.login.start - redirect_uri host: localhost:5000, path: /auth/google/callback
🔐 auth.login.success - redirect_uri host: localhost:5000, user: [user-id]
```