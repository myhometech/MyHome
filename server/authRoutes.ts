import { Router } from "express";
import passport from "./passport";
import { GOOGLE_CALLBACK_URL } from "./config/auth";
import crypto from "crypto";

const router = Router();

// Google OAuth routes
router.get("/google", 
  (req, res, next) => {
    // Generate cryptographically strong state parameter for CSRF protection
    const state = crypto.randomUUID();
    (req.session as any).oauthState = state;
    
    const redirectUri = new URL(GOOGLE_CALLBACK_URL);
    console.log(`🔐 auth.login.start - provider: google, redirect_uri host: ${redirectUri.host}, path: ${redirectUri.pathname}, state_set: true`);
    
    // Pass state parameter to Google OAuth
    passport.authenticate("google", { 
      scope: ["profile", "email"],
      state: state
    })(req, res, next);
  }
);

router.get("/google/callback",
  (req, res, next) => {
    // Verify OAuth state parameter for CSRF protection
    const expectedState = (req.session as any).oauthState;
    const receivedState = typeof req.query.state === 'string' ? req.query.state : undefined;
    
    // One-time use: clear state regardless of match to prevent replay
    delete (req.session as any).oauthState;
    
    if (!expectedState || !receivedState || expectedState !== receivedState) {
      const redirectUri = new URL(GOOGLE_CALLBACK_URL);
      console.warn(`🔐 auth.login.error - provider: google, code: state_mismatch, expected: ${!!expectedState}, received: ${!!receivedState}, redirect_uri host: ${redirectUri.host}`);
      return res.redirect('/login?error=state_mismatch');
    }
    
    // State verification passed, proceed with Passport
    next();
  },
  passport.authenticate("google", { 
    failureRedirect: "/login?error=google" 
  }),
  (req, res) => {
    // Successful authentication
    const user = req.user as any;
    const redirectUri = new URL(GOOGLE_CALLBACK_URL);
    
    console.log(`🔐 auth.login.success - provider: google, redirect_uri host: ${redirectUri.host}, user: ${user.id}`);
    
    // Store user in session format compatible with simpleAuth
    (req.session as any).user = user;
    (req.session as any).userId = user.id;
    (req.session as any).authProvider = "google";
    
    console.log(`Google OAuth Success: User ${user.id} logged in, session created`);
    
    // Force session save before redirect
    req.session.save((err: any) => {
      if (err) {
        const redirectUri = new URL(GOOGLE_CALLBACK_URL);
        console.error(`🔐 auth.login.error - provider: google, redirect_uri host: ${redirectUri.host}, error:`, err);
        return res.redirect("/login?error=google");
      }
      
      console.log(`OAuth session saved successfully for user: ${user.id}`);
      // Redirect to homepage
      res.redirect("/");
    });
  }
);

// Logout route (works for all auth providers)
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    res.clearCookie("connect.sid"); // Default session cookie name
    res.json({ message: "Logged out successfully" });
  });
});

export default router;