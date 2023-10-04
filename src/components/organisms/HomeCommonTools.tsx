import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { HomeContext } from '../../contexts/Home';
import { HomeInfoToolButton } from './HomeInfoToolButton';
import { useWindow } from '../../hooks/useWindow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const HomeCommonTools = () => {
  const { isEditingDraw, isSelectedDraw, currentDrawTool, selectDrawTool } = useContext(HomeContext);
  const { isLandscape } = useWindow();
  const insets = useSafeAreaInsets();

  const styles = StyleSheet.create({
    buttonContainer: {
      // elevation: 101,
      left: 9 + insets.left,
      marginHorizontal: 0,
      position: 'absolute',
      top: Platform.OS === 'ios' && !isLandscape ? 260 : 240,
      // zIndex: 101,
    },

    selectionalButton: {
      alignSelf: 'flex-start',
      marginTop: 2,
    },
  });
  return (
    <View style={styles.buttonContainer}>
      <View style={styles.selectionalButton}>
        <HomeInfoToolButton
          disabled={isEditingDraw || isSelectedDraw}
          isPositionRight={false}
          currentDrawTool={currentDrawTool}
          selectDrawTool={selectDrawTool}
        />
      </View>
    </View>
  );
};
