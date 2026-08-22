import { AppLanguageType } from '../types';

const APP_LANGUAGE_KEY = 'appLanguage';

// mmkvStorage.webはsessionStorageベースでブラウザを閉じると消えるため、
// 言語設定はlocalStorageに永続化する
export const getStoredLanguage = (): AppLanguageType | null => {
  try {
    const value = typeof window !== 'undefined' ? window.localStorage.getItem(APP_LANGUAGE_KEY) : null;
    return value === 'ja' || value === 'en' ? value : null;
  } catch (e) {
    return null;
  }
};

export const setStoredLanguage = (language: AppLanguageType | null): void => {
  try {
    if (typeof window === 'undefined') return;
    if (language === null) {
      window.localStorage.removeItem(APP_LANGUAGE_KEY);
    } else {
      window.localStorage.setItem(APP_LANGUAGE_KEY, language);
    }
  } catch (e) {
    // localStorageが使用不可の環境では保存しない
  }
};
