import fs from "fs";
import path from "path";
import express from "express";

export function serveStatic(app: any) {
  const publicDir = path.resolve("dist/public");
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
    // If you really want SPA fallback in environments that build the frontend:
    const indexHtml = path.join(publicDir, "index.html");
    if (fs.existsSync(indexHtml)) {
      app.get("/", (_req, res) => res.sendFile(indexHtml));
    }
  } else {
    console.log("ℹ️ No dist/public found; skipping static file serving.");
  }
}
