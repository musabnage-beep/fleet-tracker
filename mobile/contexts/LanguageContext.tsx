import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { I18nManager } from 'react-native';
import { translations, Language, TranslationKeys } from '../constants/i18n';

type LanguageContextType = {
  lang: Language;
  t: (key: TranslationKeys) => string;
  setLanguage: (lang: Language) => Promise<void>;
  isRTL: boolean;
};

const LanguageContext = createContext<LanguageContextType>({
  lang: 'ar',
  t: (key) => translations.ar[key],
  setLanguage: async () => {},
  isRTL: true,
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Language>('ar');

  useEffect(() => {
    AsyncStorage.getItem('app_language').then((saved) => {
      if (saved === 'en' || saved === 'ar') setLang(saved);
    });
  }, []);

  const t = (key: TranslationKeys): string => {
    return translations[lang][key] || translations.ar[key] || key;
  };

  const setLanguage = async (newLang: Language) => {
    setLang(newLang);
    await AsyncStorage.setItem('app_language', newLang);
    const isRTL = newLang === 'ar';
    I18nManager.allowRTL(isRTL);
    I18nManager.forceRTL(isRTL);
  };

  return (
    <LanguageContext.Provider value={{ lang, t, setLanguage, isRTL: lang === 'ar' }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
