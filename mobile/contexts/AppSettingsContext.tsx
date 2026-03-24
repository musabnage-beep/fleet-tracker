import React, { createContext, useContext, useState, useEffect } from 'react';
import { APP_CONFIG } from '../constants/config';

interface AppSettingsContextType {
  appName: string;
  companyName: string;
  logo: string | null;
  refreshSettings: () => Promise<void>;
}

const AppSettingsContext = createContext<AppSettingsContextType>({
  appName: APP_CONFIG.appName,
  companyName: APP_CONFIG.companyName,
  logo: null,
  refreshSettings: async () => {},
});

export function AppSettingsProvider({ children }: { children: React.ReactNode }) {
  const [appName, setAppName] = useState(APP_CONFIG.appName);
  const [companyName, setCompanyName] = useState(APP_CONFIG.companyName);
  const [logo, setLogo] = useState<string | null>(null);

  const refreshSettings = async () => {
    try {
      const response = await fetch(`${APP_CONFIG.serverUrl}/api/settings`);
      if (response.ok) {
        const data = await response.json();
        if (data.appName) setAppName(data.appName);
        if (data.companyName) setCompanyName(data.companyName);
        if (data.logo) setLogo(data.logo);
      }
    } catch (e) {
      // Use defaults on error
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  return (
    <AppSettingsContext.Provider value={{ appName, companyName, logo, refreshSettings }}>
      {children}
    </AppSettingsContext.Provider>
  );
}

export const useAppSettings = () => useContext(AppSettingsContext);
