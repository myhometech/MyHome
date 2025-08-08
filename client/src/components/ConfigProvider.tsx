import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppConfig, getConfig, isConfigReady } from '../config';

interface ConfigContextType {
  config: AppConfig | null;
  isLoading: boolean;
  error: Error | null;
}

const ConfigContext = createContext<ConfigContextType>({
  config: null,
  isLoading: true,
  error: null,
});

export function useConfig(): ConfigContextType {
  return useContext(ConfigContext);
}

interface ConfigProviderProps {
  children: React.ReactNode;
}

export function ConfigProvider({ children }: ConfigProviderProps): JSX.Element {
  const [state, setState] = useState<ConfigContextType>({
    config: null,
    isLoading: false, // Start with loading=false to prevent blocking
    error: null,
  });

  useEffect(() => {
    // Always try to get config, with fallback
    try {
      const config = getConfig(); // This will return fallback if needed
      setState({
        config,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      console.warn('ConfigProvider fallback to default config:', error);
      // Use default config instead of blocking
      setState({
        config: {
          API_BASE_URL: '/api',
          ENV: 'development',
          VERSION: '1.0.0'
        },
        isLoading: false,
        error: null, // Don't show error, just use fallback
      });
    }
  }, []);

  // Never block the app - always render children
  return (
    <ConfigContext.Provider value={state}>
      {children}
    </ConfigContext.Provider>
  );
}