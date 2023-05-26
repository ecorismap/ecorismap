import React, { useContext, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, MAPMEMOTOOL } from '../../constants/AppConstants';

import { Button } from '../atoms';
import { useWindow } from '../../hooks/useWindow';
import { HomeContext } from '../../contexts/Home';
import { HomeMapMemoPenButton } from './HomeMapMemoPenButton';
import { HomeMapMemoEraserButton } from './HomeMapMemoEraserButton';

export const HomeMapMemoTools = () => {
  const {
    screenState,
    showMapMemo,
    currentMapMemoTool,
    currentPen,
    currentEraser,
    penColor,
    selectMapMemoTool,
    setPen,
    setEraser,
    setShowMapMemo,
    setVisibleMapMemoColor,
    pressClearMapMemo,
    pressUndoMapMemo,
    pressRedoMapMemo,
    pressExportMapMemo,
  } = useContext(HomeContext);
  const { isLandscape } = useWindow();
  const isPositionRight = useMemo(
    () => Platform.OS !== 'web' && (screenState === 'opened' || isLandscape),
    [screenState, isLandscape]
  );

  const styles = StyleSheet.create({
    button: {
      alignSelf: 'flex-start',
      marginTop: 2,
      width: 36,
    },
    buttonContainer: {
      elevation: 101,
      left: 9,
      marginHorizontal: 0,
      position: 'absolute',
      top: Platform.OS === 'ios' ? 360 : 330,
      zIndex: 101,
    },
    buttonContainerRight: {
      elevation: 101,
      marginHorizontal: 0,
      position: 'absolute',
      right: 10,
      top: 70,
      zIndex: 101,
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
          disabled={!showMapMemo}
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
          disabled={!showMapMemo}
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
          backgroundColor={showMapMemo ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!showMapMemo}
          onPress={() => setVisibleMapMemoColor(true)}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={showMapMemo ? MAPMEMOTOOL.VISIBLE : MAPMEMOTOOL.HIDE}
          backgroundColor={COLOR.ALFABLUE}
          borderRadius={10}
          disabled={false}
          onPress={() => setShowMapMemo(!showMapMemo)}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={MAPMEMOTOOL.UNDO}
          backgroundColor={showMapMemo ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!showMapMemo}
          onPress={pressUndoMapMemo}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={MAPMEMOTOOL.REDO}
          backgroundColor={showMapMemo ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!showMapMemo}
          onPress={pressRedoMapMemo}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={MAPMEMOTOOL.DELETE}
          backgroundColor={COLOR.ALFABLUE}
          borderRadius={10}
          disabled={false}
          onPress={pressClearMapMemo}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={MAPMEMOTOOL.EXPORT}
          backgroundColor={COLOR.ALFABLUE}
          borderRadius={10}
          disabled={false}
          onPress={pressExportMapMemo}
        />
      </View>
    </View>
  );
};
