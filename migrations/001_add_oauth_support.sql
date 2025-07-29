-- Migration: Add OAuth provider support to users table
-- Created: 2025-07-28
-- Ticket: Backend Ticket 1 - Extend User Schema to Support OAuth Providers

BEGIN;

-- Add new columns to users table
ALTER TABLE users 
  ADD COLUMN auth_provider VARCHAR(20) NOT NULL DEFAULT 'email',
  ADD COLUMN provider_id VARCHAR;

-- Make email nullable for OAuth providers that don't provide email
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- Make password_hash nullable for OAuth-only accounts  
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- Drop existing unique constraint on email
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_unique;

-- Add new constraints
-- Unique constraint for OAuth providers: no duplicate provider accounts
ALTER TABLE users ADD CONSTRAINT unique_provider_account 
  UNIQUE (auth_provider, provider_id) 
  DEFERRABLE INITIALLY DEFERRED;

-- Unique constraint for email accounts (when email is provided and not null)
CREATE UNIQUE INDEX unique_email_account 
  ON users (email) 
  WHERE email IS NOT NULL;

-- Add check constraint for auth_provider enum
ALTER TABLE users ADD CONSTRAINT check_auth_provider 
  CHECK (auth_provider IN ('email', 'google', 'apple', 'twitter'));

-- Add check constraint: email users must have email and password
ALTER TABLE users ADD CONSTRAINT check_email_auth_requirements
  CHECK (
    (auth_provider = 'email' AND email IS NOT NULL AND password_hash IS NOT NULL) OR
    (auth_provider != 'email')
  );

-- Add check constraint: OAuth users must have provider_id
ALTER TABLE users ADD CONSTRAINT check_oauth_requirements
  CHECK (
    (auth_provider != 'email' AND provider_id IS NOT NULL) OR
    (auth_provider = 'email')
  );

-- Update existing users to have auth_provider = 'email' (already handled by default)
-- Update any users with null auth_provider (defensive)
UPDATE users SET auth_provider = 'email' WHERE auth_provider IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN users.auth_provider IS 'Authentication provider: email, google, apple, or twitter';
COMMENT ON COLUMN users.provider_id IS 'External user ID from OAuth provider (nullable for email users)';

COMMIT;