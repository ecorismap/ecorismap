import React from 'react';
import { View, StyleSheet, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLOR } from '../../constants/AppConstants';

export const StatusBarOverlay: React.FC = () => {
  const insets = useSafeAreaInsets();

  // Webまたはステータスバーの高さが0の場合は表示しない
  if (Platform.OS === 'web' || insets.top === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.overlay,
        {
          height: insets.top,
          // Androidでは追加の調整が必要な場合がある
          paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
        },
      ]}
    />
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: COLOR.STATUS_BAR_OVERLAY,
    zIndex: 1000,
  },
});
