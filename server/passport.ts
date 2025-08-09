import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { AuthService } from "./authService";
import type { User } from "@shared/schema";

// Configure Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `https://workspace.simontaylor66.repl.co/api/auth/google/callback`,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Extract profile information
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const firstName = profile.name?.givenName || "";
        const lastName = profile.name?.familyName || "";

        console.log(`Google OAuth: Processing user ${googleId} with email ${email}`);

        // First, check if user already exists with this Google ID
        let user = await AuthService.findUserByProvider("google", googleId);

        if (user) {
          console.log(`Google OAuth: Existing user found - ${user.id}`);
          return done(null, user);
        }

        // If no existing Google user, check for email conflict (optional deduplication)
        if (email) {
          const existingEmailUser = await AuthService.findUserByEmailAndProvider(email, "email");
          if (existingEmailUser) {
            console.log(`Google OAuth: Email ${email} already exists with email provider - creating separate Google account`);
            // Continue to create new Google account (no automatic linking)
          }
        }

        // Create new Google OAuth user
        user = await AuthService.createOAuthUser({
          email: email || undefined,
          firstName,
          lastName,
          authProvider: "google",
          providerId: googleId,
        });

        console.log(`Google OAuth: New user created - ${user.id}`);
        return done(null, user);
      } catch (error) {
        console.error("Google OAuth Error:", error);
        return done(error, false);
      }
    }
  )
);

// Serialize user for session storage
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await AuthService.findUserById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;