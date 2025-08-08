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
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    // If config is already ready from main.tsx loading, use it immediately
    if (isConfigReady()) {
      try {
        const config = getConfig();
        setState({
          config,
          isLoading: false,
          error: null,
        });
      } catch (error) {
        setState({
          config: null,
          isLoading: false,
          error: error as Error,
        });
      }
    }
  }, []);

  if (state.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-lg">Loading configuration...</div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-600 mb-4">Configuration Error</h2>
          <p className="text-gray-600">Failed to load application configuration.</p>
          <p className="text-sm text-gray-500 mt-2">{state.error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <ConfigContext.Provider value={state}>
      {children}
    </ConfigContext.Provider>
  );
}