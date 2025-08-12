// server/puppeteerBootstrap.ts
import puppeteer from "puppeteer";
import { install, computeExecutablePath, Browser as BrowserType } from "@puppeteer/browsers";
import { promises as fs } from "node:fs";

const CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || "/home/runner/.cache/puppeteer";
const BUILD_ID = process.env.PPTR_CHROMIUM_BUILD_ID || "stable";

let EXECUTABLE_PATH: string | null = null;
let BOOTSTRAP_DONE = false;

async function exists(p: string) {
  try { await fs.access(p); return true; } catch { return false; }
}

/** Ensure a browser is present in this container and set EXECUTABLE_PATH once. */
export async function ensureBrowserAtBoot(): Promise<string> {
  if (BOOTSTRAP_DONE && EXECUTABLE_PATH) return EXECUTABLE_PATH;

  // 1) Prefer Puppeteer's bundled Chrome if present
  const chromePath = puppeteer.executablePath();
  if (await exists(chromePath)) {
    EXECUTABLE_PATH = chromePath;
    BOOTSTRAP_DONE = true;
    console.log("puppeteer.bootstrap", { using: "chrome", path: EXECUTABLE_PATH });
    return EXECUTABLE_PATH;
  }

  // 2) Ensure Chromium is installed (idempotent)
  await install({ browser: BrowserType.CHROMIUM, cacheDir: CACHE_DIR, buildId: BUILD_ID });

  // 3) Resolve installed Chromium path
  const chromiumPath = computeExecutablePath({ browser: BrowserType.CHROMIUM, cacheDir: CACHE_DIR, buildId: BUILD_ID });
  if (!(await exists(chromiumPath))) {
    throw new Error(`Puppeteer bootstrap failed: chromium not found at ${chromiumPath}`);
  }

  EXECUTABLE_PATH = chromiumPath;
  BOOTSTRAP_DONE = true;
  console.log("puppeteer.bootstrap", { using: "chromium", buildId: BUILD_ID, path: EXECUTABLE_PATH });
  return EXECUTABLE_PATH;
}

export async function launchBrowser() {
  const executablePath = await ensureBrowserAtBoot();
  return puppeteer.launch({
    headless: true,
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu",
    ],
  });
}