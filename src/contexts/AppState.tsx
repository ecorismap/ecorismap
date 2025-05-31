import React, { createContext } from 'react';
import BottomSheet from '@gorhom/bottom-sheet';

export interface AppStateContextType {
  // General app states
  isOffline: boolean;
  restored: boolean;
  attribution: string;
  isLoading: boolean;
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
  gotoHome: () => void;

  // Other
  bottomSheetRef: React.RefObject<BottomSheet>;
  onCloseBottomSheet: () => Promise<void>;
  updatePmtilesURL: () => Promise<void>;
}

export const AppStateContext = createContext<AppStateContextType>({
  isOffline: false,
  restored: true,
  attribution: '',
  isLoading: false,
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
  bottomSheetRef: React.createRef<BottomSheet>(),
  onCloseBottomSheet: async () => {},
  updatePmtilesURL: async () => {},
});
