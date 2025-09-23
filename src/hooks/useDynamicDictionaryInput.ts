import { useCallback, useEffect, useState } from 'react';
import { store } from '../store';
import { DataType, LayerType } from '../types';

interface DictionaryEntry {
  value: string;
  timestamp: number;
}

// グローバルなメモリストレージ（アプリケーション全体で共有）
const globalDictionaries: { [fieldKey: string]: DictionaryEntry[] } = {};

// 全ての辞書をクリアする（プロジェクト切り替え時などに使用）
export const clearAllDynamicDictionaries = () => {
  Object.keys(globalDictionaries).forEach(key => delete globalDictionaries[key]);
};

export const addToDynamicDictionary = (fieldKey: string, value: string | number) => {
  if (value === '' || value === undefined || value === null) return;
  
  const stringValue = value.toString().trim();
  if (stringValue === '') return;
  
  if (!globalDictionaries[fieldKey]) {
    globalDictionaries[fieldKey] = [];
  }
  
  const entries = globalDictionaries[fieldKey];
  
  // Update timestamp if value already exists
  const existingIndex = entries.findIndex((e) => e.value === stringValue);
  if (existingIndex !== -1) {
    entries[existingIndex] = { value: stringValue, timestamp: Date.now() };
  } else {
    // Add new entry
    entries.push({ value: stringValue, timestamp: Date.now() });
  }
};

export type UseDynamicDictionaryInputReturnType = {
  queryString: string;
  filteredData: string[];
  isFocused: boolean;
  setQueryString: React.Dispatch<React.SetStateAction<string>>;
  setFocused: React.Dispatch<React.SetStateAction<boolean>>;
  handleSearch: (text: string) => void;
  handleSelect: (value: string) => void;
  showAllSuggestions: () => void;
};

export const useDynamicDictionaryInput = (
  fieldKey: string,
  initialValue: string,
  onValueChange?: (value: string) => void
): UseDynamicDictionaryInputReturnType => {
  const [queryString, setQueryString] = useState(initialValue);
  const [filteredData, setFilteredData] = useState<string[]>([]);
  const [isFocused, setFocused] = useState(false);

  // 既存データから辞書を初期化
  const initializeFieldDictionary = useCallback((fKey: string) => {
    if (globalDictionaries[fKey]) return; // すでに初期化済み
    
    // Redux storeから必要なデータを取得
    const state = store.getState();
    const dataSet = state.dataSet as DataType[];
    const layers = state.layers as LayerType[];
    
    const [layerId, fieldId] = fKey.split('_');
    const layer = layers.find(l => l.id === layerId);
    const field = layer?.field.find(f => f.id === fieldId);
    
    if (!field || field.format !== 'STRING_DYNAMIC') return;
    
    // 該当フィールドの値を収集
    const values = new Set<string>();
    dataSet
      .filter(d => d.layerId === layerId)
      .forEach(d => {
        d.data.forEach(record => {
          const value = record.field[field.name];
          if (value && typeof value === 'string' && value.trim()) {
            values.add(value);
          }
        });
      });
    
    // 辞書を初期化（古いタイムスタンプで）
    if (values.size > 0) {
      globalDictionaries[fKey] = Array.from(values).map(value => ({
        value,
        timestamp: 0 // 初期化時は古いタイムスタンプ
      }));
    }
  }, []);

  // 辞書データを取得
  const getDictionary = useCallback((): string[] => {
    // 必要に応じて初期化
    initializeFieldDictionary(fieldKey);
    
    const entries = globalDictionaries[fieldKey] || [];
    
    // Sort entries: recent 3 first, then alphabetically
    const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
    const recent = sorted.slice(0, 3).map((e) => e.value);
    const others = sorted
      .slice(3)
      .map((e) => e.value)
      .sort((a, b) => a.localeCompare(b, 'ja'));
    
    // Remove duplicates while preserving order
    const combined = [...recent, ...others];
    return Array.from(new Set(combined));
  }, [fieldKey, initializeFieldDictionary]);


  const filterDictionary = useCallback(
    (query: string) => {
      const dictionary = getDictionary();
      
      if (!query) {
        // Show all when empty
        return dictionary;
      }
      
      const lowerQuery = query.toLowerCase();
      
      // Filter dictionary entries
      const filtered = dictionary.filter((item) =>
        item.toLowerCase().includes(lowerQuery)
      );
      
      // Sort by relevance (items starting with query first)
      filtered.sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(lowerQuery);
        const bStarts = b.toLowerCase().startsWith(lowerQuery);
        
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.localeCompare(b, 'ja');
      });
      
      return filtered;
    },
    [getDictionary]
  );

  const handleSearch = useCallback(
    (text: string) => {
      setQueryString(text);
      const filtered = filterDictionary(text);
      
      // Add current text as an option if it's not already in the filtered list
      if (text && !filtered.includes(text)) {
        setFilteredData([...filtered, text]);
      } else {
        setFilteredData(filtered);
      }
    },
    [filterDictionary]
  );

  const handleSelect = useCallback(
    (value: string) => {
      setQueryString(value);
      setFilteredData([]);
      setFocused(false);
      
      // Notify parent component
      if (onValueChange) {
        onValueChange(value);
      }
    },
    [onValueChange]
  );

  const showAllSuggestions = useCallback(() => {
    setFocused(true);
    const allSuggestions = filterDictionary('');
    
    // Add current query string if not empty and not in suggestions
    if (queryString && !allSuggestions.includes(queryString)) {
      setFilteredData([...allSuggestions, queryString]);
    } else {
      setFilteredData(allSuggestions);
    }
  }, [filterDictionary, queryString]);

  useEffect(() => {
    setQueryString(initialValue);
  }, [initialValue]);

  return {
    queryString,
    filteredData,
    isFocused,
    setQueryString,
    setFocused,
    handleSearch,
    handleSelect,
    showAllSuggestions,
  } as const;
};