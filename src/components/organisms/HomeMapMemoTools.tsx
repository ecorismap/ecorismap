import React, { useContext, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, MAPMEMOTOOL } from '../../constants/AppConstants';

import { Button } from '../atoms';
import { useWindow } from '../../hooks/useWindow';
import { HomeContext } from '../../contexts/Home';
import { HomeMapMemoPenButton } from './HomeMapMemoPenButton';
import { HomeMapMemoEraserButton } from './HomeMapMemoEraserButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTablet } from 'react-native-device-info';

export const HomeMapMemoTools = () => {
  const {
    currentMapMemoTool,
    currentPen,
    currentEraser,
    penColor,
    editableMapMemo,
    isPencilModeActive,
    selectMapMemoTool,
    setPen,
    setEraser,
    setVisibleMapMemoColor,
    pressUndoMapMemo,
    pressRedoMapMemo,
    togglePencilMode,
  } = useContext(HomeContext);

  const insets = useSafeAreaInsets();
  const { isLandscape } = useWindow();
  const isPositionRight = useMemo(() => Platform.OS !== 'web' && isLandscape, [isLandscape]);

  const styles = StyleSheet.create({
    button: {
      alignSelf: 'flex-start',
      marginTop: 2,
      width: 36,
    },
    buttonContainer: {
      elevation: 101,
      left: 9 + insets.left,
      marginHorizontal: 0,
      position: 'absolute',
      top: Platform.OS === 'ios' ? 360 : 330,
      // zIndex: 101,
    },
    buttonContainerRight: {
      elevation: 101,
      marginHorizontal: 0,
      position: 'absolute',
      right: 10 + insets.right,
      top: 70,
      // zIndex: 101,
    },
    buttonRight: {
      alignSelf: 'flex-end',
      marginTop: 2,
      width: 36,
    },
    selectionalButton: {
      alignSelf: 'flex-start',
      marginTop: 2,
    },
    selectionalButtonRight: {
      alignSelf: 'flex-end',
      marginTop: 2,
    },
  });

  return (
    <View style={isPositionRight ? styles.buttonContainerRight : styles.buttonContainer}>
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        <HomeMapMemoPenButton
          disabled={!editableMapMemo}
          isPositionRight={isPositionRight}
          currentMapMemoTool={currentMapMemoTool}
          currentPen={currentPen}
          penColor={penColor}
          selectMapMemoTool={selectMapMemoTool}
          setPen={setPen}
        />
      </View>
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        <HomeMapMemoEraserButton
          disabled={!editableMapMemo}
          isPositionRight={isPositionRight}
          currentMapMemoTool={currentMapMemoTool}
          currentEraser={currentEraser}
          selectMapMemoTool={selectMapMemoTool}
          setEraser={setEraser}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={MAPMEMOTOOL.COLOR}
          backgroundColor={editableMapMemo ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!editableMapMemo}
          onPress={() => setVisibleMapMemoColor(true)}
        />
      </View>
      {Platform.OS === 'ios' && isTablet() && (
        <View style={isPositionRight ? styles.buttonRight : styles.button}>
          <Button
            name={MAPMEMOTOOL.PENCIL_LOCK}
            backgroundColor={isPencilModeActive ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPress={togglePencilMode}
          />
        </View>
      )}
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={MAPMEMOTOOL.UNDO}
          backgroundColor={editableMapMemo ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!editableMapMemo}
          onPress={pressUndoMapMemo}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={MAPMEMOTOOL.REDO}
          backgroundColor={editableMapMemo ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!editableMapMemo}
          onPress={pressRedoMapMemo}
        />
      </View>
    </View>
  );
};
