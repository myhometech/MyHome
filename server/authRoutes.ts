import { Router } from "express";
import passport from "./passport";

const router = Router();

// Google OAuth routes
router.get("/google", 
  passport.authenticate("google", { 
    scope: ["profile", "email"] 
  })
);

router.get("/google/callback",
  passport.authenticate("google", { 
    failureRedirect: "/login?error=google" 
  }),
  (req, res) => {
    // Successful authentication
    const user = req.user as any;
    
    // Store user in session format compatible with simpleAuth
    (req.session as any).user = user;
    (req.session as any).userId = user.id;
    (req.session as any).authProvider = "google";
    
    console.log(`Google OAuth Success: User ${user.id} logged in, session created`);
    
    // Force session save before redirect
    req.session.save((err: any) => {
      if (err) {
        console.error("OAuth session save error:", err);
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