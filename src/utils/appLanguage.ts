import { AppLanguageType } from '../types';
import { storage } from './mmkvStorage';

const APP_LANGUAGE_KEY = 'appLanguage';

// i18n初期化前（モジュール評価時）に呼ばれるため同期的に読み書きする
export const getStoredLanguage = (): AppLanguageType | null => {
  const value = storage.getString(APP_LANGUAGE_KEY);
  return value === 'ja' || value === 'en' ? value : null;
};

export const setStoredLanguage = (language: AppLanguageType | null): void => {
  if (language === null) {
    storage.remove(APP_LANGUAGE_KEY);
  } else {
    storage.set(APP_LANGUAGE_KEY, language);
  }
};
