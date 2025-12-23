import React, { createContext, useContext, useState, useCallback, ReactNode, useMemo } from 'react';
import { AccountFormStateType, LayerType, ProjectType, RecordType, RegionType, TileMapType } from '../types';

// RootStack画面の型定義
export type RootScreenName = 'Home' | 'Account' | 'AccountSettings' | 'Purchases' | 'Projects' | 'ProjectEdit' | 'CloudDataManagement';

// 各画面のパラメータ型
export type RootScreenParams = {
  Account: { accountFormState?: AccountFormStateType; message?: string; previous?: RootScreenName };
  Home:
    | {
        tileMap?: TileMapType | undefined;
        jumpTo?: RegionType;
        previous: RootScreenName | 'Settings' | 'Maps' | 'DataEdit';
        mode:
          | 'exportPDF'
          | 'openEcorisMap'
          | 'clearEcorisMap'
          | 'downloadMap'
          | 'jumpTo'
          | 'editPosition'
          | 'download'
          | undefined;
        layer?: LayerType;
        record?: RecordType;
        withCoord?: boolean;
      }
    | undefined;
  AccountSettings: { previous: RootScreenName };
  Purchases: undefined;
  Projects: { reload: boolean } | undefined;
  ProjectEdit: {
    previous: RootScreenName;
    project: ProjectType;
    isNew: boolean;
  };
  CloudDataManagement: {
    previous: RootScreenName;
    project: ProjectType;
  };
};

// ナビゲーション履歴エントリ
interface NavigationHistoryEntry<T extends RootScreenName = RootScreenName> {
  screen: T;
  params: RootScreenParams[T];
}

// Context型定義
interface RootNavigationContextType {
  currentScreen: RootScreenName;
  currentParams: RootScreenParams[RootScreenName];
  navigate: <T extends RootScreenName>(screen: T, params?: RootScreenParams[T]) => void;
  setParams: (params: Partial<RootScreenParams[RootScreenName]>) => void;
}

const RootNavigationContext = createContext<RootNavigationContextType | undefined>(undefined);

interface RootNavigationProviderProps {
  children: ReactNode;
  initialScreen?: RootScreenName;
  initialParams?: RootScreenParams[RootScreenName];
}

export function RootNavigationProvider({
  children,
  initialScreen = 'Home',
  initialParams = undefined,
}: RootNavigationProviderProps) {
  const [history, setHistory] = useState<NavigationHistoryEntry[]>([
    { screen: initialScreen, params: initialParams },
  ]);

  const currentEntry = history[history.length - 1];

  const navigate = useCallback(<T extends RootScreenName>(screen: T, params?: RootScreenParams[T]) => {
    setHistory((prev) => [...prev, { screen, params } as NavigationHistoryEntry]);
  }, []);

  const setParams = useCallback((params: Partial<RootScreenParams[RootScreenName]>) => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const newHistory = [...prev];
      const lastEntry = newHistory[newHistory.length - 1];
      newHistory[newHistory.length - 1] = {
        ...lastEntry,
        params: { ...lastEntry.params, ...params } as RootScreenParams[RootScreenName],
      };
      return newHistory;
    });
  }, []);

  const value = useMemo(
    () => ({
      currentScreen: currentEntry.screen,
      currentParams: currentEntry.params,
      navigate,
      setParams,
    }),
    [currentEntry, navigate, setParams]
  );

  return <RootNavigationContext.Provider value={value}>{children}</RootNavigationContext.Provider>;
}

export function useRootNavigation() {
  const context = useContext(RootNavigationContext);
  if (!context) {
    throw new Error('useRootNavigation must be used within a RootNavigationProvider');
  }
  return context;
}

// 特定の画面のパラメータを取得するためのフック
export function useRootRoute<T extends RootScreenName>(): {
  params: RootScreenParams[T];
} {
  const context = useContext(RootNavigationContext);
  if (!context) {
    throw new Error('useRootRoute must be used within a RootNavigationProvider');
  }
  return {
    params: context.currentParams as RootScreenParams[T],
  };
}
