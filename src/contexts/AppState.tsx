import React, { createContext } from 'react';
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types';
import { NavigateToHomeParams } from './BottomSheetNavigationContext';

export interface AppStateContextType {
  // General app states
  isOffline: boolean;
  restored: boolean;
  attribution: string;
  isLoading: boolean;
  setLoading: (loading: boolean) => void;
  user: {
    uid: string | undefined;
    email: string | null;
    displayName: string | null;
    photoURL: string | null;
  };

  // Navigation
  gotoMaps: () => void;
  gotoSettings: () => void;
  gotoLayers: () => void;
  gotoHome: (params?: NavigateToHomeParams) => void;
  onSplitRouteChange: (routeName: string) => void;

  // Other
  bottomSheetRef: React.RefObject<BottomSheetMethods | null>;
  onCloseBottomSheet: (currentRouteName?: string) => Promise<void>;
  updatePmtilesURL: () => Promise<void>;
}

export const AppStateContext = createContext<AppStateContextType>({
  isOffline: false,
  restored: true,
  attribution: '',
  isLoading: false,
  setLoading: () => {},
  user: {
    uid: undefined,
    email: null,
    displayName: null,
    photoURL: null,
  },
  gotoMaps: () => {},
  gotoSettings: () => {},
  gotoLayers: () => {},
  gotoHome: () => {},
  onSplitRouteChange: () => {},
  bottomSheetRef: React.createRef<BottomSheetMethods>(),
  onCloseBottomSheet: async () => {},
  updatePmtilesURL: async () => {},
});
