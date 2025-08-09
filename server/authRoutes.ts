import { Router } from "express";
import passport from "./passport";

const router = Router();

// Google OAuth routes
router.get("/google", (req, res, next) => {
  // CRITICAL FIX: FORCE production for myhome-docs.com domain
  const host = req.get('host') || req.get('x-forwarded-host') || '';
  const referer = req.get('referer') || '';
  
  console.log(`🚨 CRITICAL OAUTH REQUEST: Host=${host}, Referer=${referer}`);
  
  // HARDCODE production detection for myhome-docs.com
  const isProduction = host === 'myhome-docs.com';
  
  console.log(`🚨 PRODUCTION DETECTION: ${isProduction ? 'YES' : 'NO'} (host: ${host})`);
  
  const clientId = isProduction 
    ? (process.env.GOOGLE_CLIENT_ID_PROD || process.env.GOOGLE_CLIENT_ID!)
    : (process.env.GOOGLE_CLIENT_ID_DEV || process.env.GOOGLE_CLIENT_ID!);
  const callbackURL = isProduction
    ? `https://myhome-docs.com/api/auth/google/callback`  // Production
    : `https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`;  // Development
    
  console.log(`🔥 OAUTH INITIATION: Starting Google OAuth for user from ${req.ip}`);
  console.log(`🔥 OAUTH CONFIG: Host header: ${host}`);
  console.log(`🔥 OAUTH CONFIG: Referer: ${referer}`);
  console.log(`🔥 OAUTH CONFIG: Original URL: ${req.originalUrl}`);  
  console.log(`🔥 OAUTH CONFIG: All headers:`, JSON.stringify(req.headers, null, 2));
  console.log(`🔥 OAUTH CONFIG: Environment: ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(`🔥 OAUTH CONFIG: Using Client ID: ${clientId.substring(0, 20)}...`);
  console.log(`🔥 OAUTH CONFIG: Using callback URL: ${callbackURL}`);
  console.log(`🔥 OAUTH CONFIG: REPLIT_DEPLOYMENT: ${process.env.REPLIT_DEPLOYMENT}`);
  console.log(`🔥 OAUTH CONFIG: NODE_ENV: ${process.env.NODE_ENV}`);
  
  // Use the appropriate strategy based on environment
  const strategyName = isProduction ? "google-prod" : "google-dev";
  console.log(`🔥 OAUTH CONFIG: Using strategy: ${strategyName}`);
    
  passport.authenticate(strategyName, { 
    scope: ["profile", "email"] 
  })(req, res, next);
});

router.get("/google/callback",
  (req, res, next) => {
    console.log(`🔥 OAuth callback received - URL: ${req.url}`);
    console.log(`🔥 OAuth callback - Query params:`, req.query);
    console.log(`🔥 OAuth callback - Session ID:`, req.sessionID);
    
    // Check for OAuth error parameters
    if (req.query.error) {
      console.error(`❌ OAuth error from Google:`, req.query.error);
      console.error(`❌ OAuth error description:`, req.query.error_description);
      return res.redirect("/login?error=oauth_failed");
    }
    
    next();
  },
  (req, res, next) => {
    // FORCE PRODUCTION DETECTION for myhome-docs.com callback requests  
    const host = req.get('host') || req.get('x-forwarded-host') || '';
    const isProduction = host === 'myhome-docs.com' || 
                         process.env.REPLIT_DEPLOYMENT === '1' || 
                         process.env.NODE_ENV === 'production';
    
    const strategyName = isProduction ? "google-prod" : "google-dev";
    console.log(`🔥 OAUTH CALLBACK: Using strategy: ${strategyName} for host: ${host}`);
    
    passport.authenticate(strategyName, { 
      failureRedirect: "/login?error=google",
      failureFlash: true
    })(req, res, next);
  },
  (req, res) => {
    // Successful authentication
    const user = req.user as any;
    
    console.log(`🔥 Google OAuth Success: User ${user.id} (${user.email}) logged in`);
    console.log(`🔥 OAuth callback - req.user:`, !!req.user);
    console.log(`🔥 OAuth callback - req.session before:`, !!(req.session as any)?.user);
    console.log(`🔥 OAuth callback - Session ID after auth:`, req.sessionID);
    
    // Store user in session format compatible with simpleAuth
    (req.session as any).user = user;
    (req.session as any).userId = user.id;
    (req.session as any).authProvider = "google";
    
    console.log(`🔥 OAuth callback - req.session after:`, !!(req.session as any)?.user);
    
    // Force session save before redirect
    req.session.save((err: any) => {
      if (err) {
        console.error("❌ OAuth session save error:", err);
        return res.redirect("/login?error=google");
      }
      
      console.log(`✅ OAuth session saved successfully for user: ${user.id} (${user.email})`);
      console.log(`✅ Session details - ID: ${req.sessionID}, User: ${user.email}`);
      
      // Direct redirect instead of HTML page to avoid issues
      console.log(`🔀 Redirecting user ${user.id} to home page`);
      res.redirect('/');
    });
  }
);

// Check user authentication status
router.get("/user", (req: any, res) => {
  console.log('Auth check - Session user:', req.session?.user ? 'exists' : 'none');
  console.log('Auth check - Session userId:', req.session?.userId);
  
  const user = req.user || req.session?.user;
  
  if (!user) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  
  // Return safe user data (without password hash)
  const { passwordHash, ...safeUser } = user;
  res.json({ user: safeUser });
});

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