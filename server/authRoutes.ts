import { Router } from "express";
import passport from "./passport";

const router = Router();

// Google OAuth routes
router.get("/google", (req, res, next) => {
  console.log(`🔥 OAUTH INITIATION: Starting Google OAuth for user from ${req.ip}`);
  console.log(`🔥 OAUTH CONFIG: Client ID present: ${!!process.env.GOOGLE_CLIENT_ID}`);
  console.log(`🔥 OAUTH CONFIG: Dev callback URL: https://${process.env.REPLIT_DEV_DOMAIN}/api/auth/google/callback`);
    
  passport.authenticate("google", { 
    scope: ["profile", "email"] 
  })(req, res, next);
});

router.get("/google/callback",
  passport.authenticate("google", { 
    failureRedirect: "/login?error=google" 
  }),
  (req, res) => {
    // Successful authentication
    const user = req.user as any;
    
    console.log(`🔥 Google OAuth Success: User ${user.id} (${user.email}) logged in`);
    console.log(`🔥 OAuth callback - req.user:`, !!req.user);
    console.log(`🔥 OAuth callback - req.session before:`, !!(req.session as any)?.user);
    
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