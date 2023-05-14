import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { HomeContext } from '../../contexts/Home';
import { HomeInfoToolButton } from './HomeInfoToolButton';
import { useWindow } from '../../hooks/useWindow';
import { useScreen } from '../../hooks/useScreen';

export const HomeCommonTools = () => {
  const { isEditingDraw, isSelectedDraw, currentDrawTool, selectDrawTool } = useContext(HomeContext);
  const { isLandscape } = useWindow();
  const { screenState } = useScreen();

  const styles = StyleSheet.create({
    buttonContainer: {
      elevation: 101,
      left: 9,
      marginHorizontal: 0,
      position: 'absolute',
      top: Platform.OS === 'ios' && !isLandscape && screenState !== 'opened' ? 260 : 240,
      zIndex: 101,
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
