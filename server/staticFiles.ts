import path from "path";
import express from "express";

export function serveStatic(app: any) {
  const publicDir = path.resolve("dist/public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}
