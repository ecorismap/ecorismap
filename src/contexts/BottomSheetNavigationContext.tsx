import { createContext, useContext, useCallback, useMemo, useRef, useState, ReactNode } from 'react';
import BottomSheet from '@gorhom/bottom-sheet';
import { ColorStyle, LayerType, RecordType, RegionType, TileMapType } from '../types';

// navigateToHome用のパラメータ型
export interface NavigateToHomeParams {
  previous: 'Settings' | 'Maps' | 'DataEdit';
  mode?:
    | 'exportPDF'
    | 'openEcorisMap'
    | 'clearEcorisMap'
    | 'downloadMap'
    | 'jumpTo'
    | 'editPosition'
    | 'download'
    | undefined;
  tileMap?: TileMapType;
  jumpTo?: RegionType;
  layer?: LayerType;
  record?: RecordType;
  withCoord?: boolean;
}

// 画面のパラメータ型定義（split.tsxのSplitStackParamListから移行）
export type BottomSheetScreenParams = {
  Layers: undefined;
  Data: {
    targetLayer: LayerType;
  };
  DataEdit: {
    previous: 'Data' | 'DataEdit' | 'Home';
    targetData: RecordType;
    targetLayer: LayerType;
    mainData?: RecordType;
    mainLayer?: LayerType;
  };
  LayerEdit: {
    targetLayer: LayerType;
    isEdited: boolean;
    previous?: 'Layers' | 'LayerEditFeatureStyle' | 'LayerEditFieldItem';
    colorStyle?: ColorStyle;
    fieldIndex?: number;
    itemValues?: { value: string; isOther: boolean; customFieldValue: string }[];
    useLastValue?: boolean;
  };
  LayerEditFeatureStyle: {
    targetLayer: LayerType;
    isEdited: boolean;
    previous?: 'LayerEdit' | 'Layers';
  };
  LayerEditFieldItem: {
    targetLayer: LayerType;
    fieldIndex: number;
    fieldItem: LayerType['field'][0];
    isEdited: boolean;
  };
  Maps: undefined;
  MapList: undefined;
  MapEdit: {
    targetMap: TileMapType | null;
    previous?: 'Maps';
  };
  Settings: { previous: 'Home' };
  Licenses: { previous: 'Settings' };
};

export type BottomSheetScreenName = keyof BottomSheetScreenParams;

// スタック内の画面情報
export interface BottomSheetScreen<T extends BottomSheetScreenName = BottomSheetScreenName> {
  name: T;
  params?: BottomSheetScreenParams[T];
}

// Context の型定義
export interface BottomSheetNavigationContextType {
  // 現在の画面
  currentScreen: BottomSheetScreen;
  // 履歴スタック（戻る機能用）
  stack: BottomSheetScreen[];
  // ナビゲーション関数
  navigate: <T extends BottomSheetScreenName>(screen: T, params?: BottomSheetScreenParams[T]) => void;
  goBack: () => void;
  canGoBack: () => boolean;
  // スタックをリセットして特定の画面に遷移
  reset: <T extends BottomSheetScreenName>(screen: T, params?: BottomSheetScreenParams[T]) => void;
  // BottomSheet制御
  bottomSheetRef: React.RefObject<BottomSheet | null>;
  openBottomSheet: (snapIndex?: number) => void;
  closeBottomSheet: () => void;
  snapToIndex: (index: number) => void;
  // 現在のルート名（互換性のため）
  currentRouteName: BottomSheetScreenName;
  // Homeに戻る（位置編集、ジャンプなど）
  navigateToHome: (params?: NavigateToHomeParams) => void;
  // BottomSheetが開いているかどうか
  isBottomSheetOpen: boolean;
  setIsBottomSheetOpen: (isOpen: boolean) => void;
}

// デフォルト値
const defaultValue: BottomSheetNavigationContextType = {
  currentScreen: { name: 'Layers' },
  stack: [{ name: 'Layers' }],
  navigate: () => {},
  goBack: () => {},
  canGoBack: () => false,
  reset: () => {},
  bottomSheetRef: { current: null },
  openBottomSheet: () => {},
  closeBottomSheet: () => {},
  snapToIndex: () => {},
  currentRouteName: 'Layers',
  navigateToHome: () => {},
  isBottomSheetOpen: false,
  setIsBottomSheetOpen: () => {},
};

export const BottomSheetNavigationContext = createContext<BottomSheetNavigationContextType>(defaultValue);

// Provider コンポーネント
interface BottomSheetNavigationProviderProps {
  children: ReactNode;
  initialScreen?: BottomSheetScreenName;
  onRouteChange?: (routeName: BottomSheetScreenName) => void;
  onNavigateToHome?: (params?: NavigateToHomeParams) => void;
  externalBottomSheetRef?: React.RefObject<BottomSheet | null>;
}

export function BottomSheetNavigationProvider({
  children,
  initialScreen = 'Layers',
  onRouteChange,
  onNavigateToHome,
  externalBottomSheetRef,
}: BottomSheetNavigationProviderProps) {
  const internalBottomSheetRef = useRef<BottomSheet>(null);
  const bottomSheetRef = externalBottomSheetRef || internalBottomSheetRef;
  const [stack, setStack] = useState<BottomSheetScreen[]>([{ name: initialScreen }]);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);

  const currentScreen = stack[stack.length - 1];

  // ナビゲーション関数
  const navigate = useCallback(
    <T extends BottomSheetScreenName>(screen: T, params?: BottomSheetScreenParams[T]) => {
      setStack((prev) => [...prev, { name: screen, params } as BottomSheetScreen]);
      onRouteChange?.(screen);
    },
    [onRouteChange]
  );

  // 戻る関数
  const goBack = useCallback(() => {
    if (stack.length > 1) {
      setStack((prev) => {
        const newStack = prev.slice(0, -1);
        const newScreen = newStack[newStack.length - 1];
        onRouteChange?.(newScreen.name);
        return newStack;
      });
    }
  }, [stack.length, onRouteChange]);

  // 戻れるかどうか
  const canGoBack = useCallback(() => stack.length > 1, [stack.length]);

  // スタックをリセットして特定の画面に遷移
  const reset = useCallback(
    <T extends BottomSheetScreenName>(screen: T, params?: BottomSheetScreenParams[T]) => {
      setStack([{ name: screen, params } as BottomSheetScreen]);
      onRouteChange?.(screen);
    },
    [onRouteChange]
  );

  // BottomSheet制御関数
  // bottomSheetRef は useRef で作成されているため、値は変わらない
  const openBottomSheet = useCallback((snapIndex = 2) => {
    bottomSheetRef.current?.snapToIndex(snapIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeBottomSheet = useCallback(() => {
    bottomSheetRef.current?.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const snapToIndex = useCallback((index: number) => {
    bottomSheetRef.current?.snapToIndex(index);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const navigateToHome = useCallback(
    (params?: NavigateToHomeParams) => {
      onNavigateToHome?.(params);
    },
    [onNavigateToHome]
  );

  const value = useMemo<BottomSheetNavigationContextType>(
    () => ({
      currentScreen,
      stack,
      navigate,
      goBack,
      canGoBack,
      reset,
      bottomSheetRef,
      openBottomSheet,
      closeBottomSheet,
      snapToIndex,
      currentRouteName: currentScreen.name,
      navigateToHome,
      isBottomSheetOpen,
      setIsBottomSheetOpen,
    }),
    // bottomSheetRef は useRef で作成されているため、値は変わらない
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentScreen, stack, navigate, goBack, canGoBack, reset, openBottomSheet, closeBottomSheet, snapToIndex, navigateToHome, isBottomSheetOpen]
  );

  return <BottomSheetNavigationContext.Provider value={value}>{children}</BottomSheetNavigationContext.Provider>;
}

// カスタムフック
export function useBottomSheetNavigation() {
  const context = useContext(BottomSheetNavigationContext);
  if (!context) {
    throw new Error('useBottomSheetNavigation must be used within a BottomSheetNavigationProvider');
  }
  return context;
}

// 特定の画面のパラメータを取得するヘルパーフック
export function useBottomSheetRoute<T extends BottomSheetScreenName>(): {
  name: T;
  params: BottomSheetScreenParams[T] | undefined;
} {
  const { currentScreen } = useBottomSheetNavigation();
  return {
    name: currentScreen.name as T,
    params: currentScreen.params as BottomSheetScreenParams[T] | undefined,
  };
}

// React Navigation互換のnavigationオブジェクトを提供するフック
// 既存のcontainerコンポーネントとの互換性のため
export function useCompatNavigation() {
  const { navigate, goBack, canGoBack } = useBottomSheetNavigation();

  return useMemo(
    () => ({
      navigate: <T extends BottomSheetScreenName>(screen: T, params?: BottomSheetScreenParams[T]) => {
        navigate(screen, params);
      },
      goBack,
      canGoBack,
      // setParamsは現状サポートしない（必要に応じて追加）
      setParams: () => {
        console.warn('setParams is not supported in BottomSheetNavigation');
      },
    }),
    [navigate, goBack, canGoBack]
  );
}

// React Navigation互換のrouteオブジェクトを提供するフック
export function useCompatRoute<T extends BottomSheetScreenName>() {
  const { currentScreen } = useBottomSheetNavigation();

  return useMemo(
    () => ({
      name: currentScreen.name as T,
      params: currentScreen.params as BottomSheetScreenParams[T],
      key: `${currentScreen.name}-${Date.now()}`, // 簡易的なkey
    }),
    [currentScreen]
  );
}
