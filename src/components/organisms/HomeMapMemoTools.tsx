import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, MAPMEMOTOOL, STAMP, BRUSH, ERASER } from '../../constants/AppConstants';

import { Button } from '../atoms';
import { HomeContext } from '../../contexts/Home';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTablet } from 'react-native-device-info';

export const HomeMapMemoTools = () => {
  const {
    currentMapMemoTool,
    isPencilModeActive,
    isUndoable,
    isRedoable,
    isModalMapMemoToolHidden,
    selectMapMemoTool,
    setVisibleMapMemoColor,
    setVisibleMapMemoPen,
    setVisibleMapMemoStamp,
    setVisibleMapMemoBrush,
    setVisibleMapMemoEraser,
    pressUndoMapMemo,
    pressRedoMapMemo,
    togglePencilMode,
  } = useContext(HomeContext);

  const insets = useSafeAreaInsets();

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

    selectionalButton: {
      alignSelf: 'flex-start',
      marginTop: 2,
    },
  });

  return (
    <View style={styles.buttonContainer}>
      <View style={styles.selectionalButton}>
        <Button
          name={MAPMEMOTOOL.PEN}
          backgroundColor={currentMapMemoTool === 'PEN' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() =>
            isModalMapMemoToolHidden
              ? currentMapMemoTool === 'PEN'
                ? selectMapMemoTool(undefined)
                : selectMapMemoTool('PEN')
              : setVisibleMapMemoPen(true)
          }
          onLongPress={() => setVisibleMapMemoPen(true)}
        />
      </View>
      <View style={styles.button}>
        <Button
          // @ts-ignore
          name={STAMP[currentMapMemoTool] || STAMP.STAMP}
          backgroundColor={Object.keys(STAMP).includes(currentMapMemoTool) ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => setVisibleMapMemoStamp(true)}
          onLongPress={() => selectMapMemoTool(undefined)}
        />
      </View>
      <View style={styles.button}>
        <Button
          // @ts-ignore
          name={BRUSH[currentMapMemoTool] || BRUSH.BRUSH}
          backgroundColor={Object.keys(BRUSH).includes(currentMapMemoTool) ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => setVisibleMapMemoBrush(true)}
          onLongPress={() => selectMapMemoTool(undefined)}
        />
      </View>

      <View style={styles.button}>
        <Button
          // @ts-ignore
          name={ERASER.ERASER}
          backgroundColor={Object.keys(ERASER).includes(currentMapMemoTool) ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => setVisibleMapMemoEraser(true)}
          onLongPress={() => selectMapMemoTool(undefined)}
        />
      </View>
      <View style={styles.button}>
        <Button
          name={MAPMEMOTOOL.COLOR}
          backgroundColor={COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => setVisibleMapMemoColor(true)}
        />
      </View>

      {Platform.OS === 'ios' && isTablet() && (
        <View style={styles.button}>
          <Button
            name={MAPMEMOTOOL.PENCIL_LOCK}
            backgroundColor={isPencilModeActive ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPress={togglePencilMode}
          />
        </View>
      )}
      <View style={styles.button}>
        <Button
          name={MAPMEMOTOOL.UNDO}
          backgroundColor={isUndoable ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isUndoable}
          onPress={pressUndoMapMemo}
        />
      </View>
      <View style={styles.button}>
        <Button
          name={MAPMEMOTOOL.REDO}
          backgroundColor={isRedoable ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isRedoable}
          onPress={pressRedoMapMemo}
        />
      </View>
    </View>
  );
};
