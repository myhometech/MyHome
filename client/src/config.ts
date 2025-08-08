// client/src/config.ts
export type AppConfig = {
  API_BASE_URL: string;
  SENTRY_DSN?: string;
  ENV: 'development' | 'staging' | 'production';
  VERSION?: string;
};

let cached: AppConfig | null = null;
let isConfigLoaded = false;

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;
  try {
    console.log('Loading config.json...');
    const res = await fetch('/config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`config.json ${res.status}`);
    cached = await res.json();
    // Basic validation
    if (!cached?.API_BASE_URL) throw new Error('API_BASE_URL missing in config.json');
    isConfigLoaded = true;
    console.log('✅ Config loaded successfully:', cached);
    return cached!;
  } catch (e) {
    console.error('Config load failed:', e);
    const el = document.getElementById('root');
    if (el) {
      el.innerHTML = `
        <div style="padding:24px;font-family:system-ui, sans-serif">
          <h2>Startup error</h2>
          <p>Failed to load configuration. Please contact support.</p>
        </div>`;
    }
    throw e;
  }
}

export function isConfigReady(): boolean {
  return isConfigLoaded;
}

export function getConfig(): AppConfig {
  if (!cached) throw new Error('Config not loaded');
  return cached;
}