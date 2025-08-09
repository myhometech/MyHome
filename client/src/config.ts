// client/src/config.ts
export type AppConfig = {
  API_BASE_URL: string;
  SENTRY_DSN?: string;
  ENV: 'development' | 'staging' | 'production';
  VERSION?: string;
};

interface Config {
  API_BASE_URL: string;
  ENV: string;
  VERSION: string;
}

let config: Config | null = null;
let configPromise: Promise<Config> | null = null;

export async function loadConfig(): Promise<Config> {
  if (config) {
    return config;
  }

  // Prevent multiple simultaneous config loads
  if (configPromise) {
    return configPromise;
  }

  configPromise = (async (): Promise<Config> => {
    try {
      console.log('Loading config.json...');

      // Much shorter timeout to prevent hanging
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch('/config.json', {
        signal: controller.signal,
        cache: 'no-cache'
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to load config: ${response.status}`);
      }

      const loadedConfig = await response.json();
      config = loadedConfig;
      console.log('✅ Config loaded successfully:', config);
      return config as Config;
    } catch (error) {
      console.warn('⚠️ Config loading failed, using immediate fallback:', error);

      // Immediate fallback configuration
      config = {
        API_BASE_URL: '/api',
        ENV: 'development',
        VERSION: '1.0.0'
      };

      console.log('🔄 Using fallback config:', config);
      return config;
    } finally {
      configPromise = null;
    }
  })();

  return configPromise as Promise<Config>;
}

export function getConfig(): Config {
  if (!config) {
    // Return immediate fallback if config not loaded
    return {
      API_BASE_URL: '/api',
      ENV: 'development',
      VERSION: '1.0.0'
    };
  }
  return config;
}

export function isConfigReady(): boolean {
  return config !== null;
}

// Ensure default export is available
export default getConfig;