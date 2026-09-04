import React, { useContext } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { COLOR, MAPMEMOTOOL, STAMP, BRUSH, ERASER } from '../../constants/AppConstants';

import { Button } from '../atoms';
import { MapMemoContext } from '../../contexts/MapMemo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTablet } from 'react-native-device-info';
import { t } from 'i18next';
import { isBrushTool, isEraserTool, isStampTool } from '../../utils/General';
import { MapMemoToolGroupType } from '../../types';

export const HomeMapMemoTools = React.memo(() => {
  const {
    currentMapMemoTool,
    isPencilModeActive,
    isUndoable,
    isRedoable,
    pressMapMemoToolButton,
    openMapMemoSettingsTab,
    setVisibleMapMemoColor,
    pressUndoMapMemo,
    pressRedoMapMemo,
    togglePencilMode,
  } = useContext(MapMemoContext);

  const insets = useSafeAreaInsets();

  //歯車ボタンで開くタブ。選択中ツールのグループ、未選択ならペン
  const currentGroup: MapMemoToolGroupType = isStampTool(currentMapMemoTool)
    ? 'STAMP'
    : isBrushTool(currentMapMemoTool)
    ? 'BRUSH'
    : isEraserTool(currentMapMemoTool)
    ? 'ERASER'
    : 'PEN';

  const styles = StyleSheet.create({
    button: {
      alignSelf: 'flex-start',
      marginTop: 2,
      width: 40,
    },
    buttonContainer: {
      elevation: 101,
      left: 9 + insets.left,
      marginHorizontal: 0,
      position: 'absolute',
      top: insets.top + 340,
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
          onPress={() => pressMapMemoToolButton('PEN')}
          labelText={t('Home.label.pen')}
        />
      </View>
      <View style={styles.button}>
        <Button
          // @ts-ignore
          name={STAMP[currentMapMemoTool] || STAMP.STAMP}
          backgroundColor={Object.keys(STAMP).includes(currentMapMemoTool) ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => pressMapMemoToolButton('STAMP')}
          labelText={t('Home.label.stamp')}
          labelFontSize={9}
        />
      </View>
      <View style={styles.button}>
        <Button
          // @ts-ignore
          name={BRUSH[currentMapMemoTool] || BRUSH.BRUSH}
          backgroundColor={Object.keys(BRUSH).includes(currentMapMemoTool) ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => pressMapMemoToolButton('BRUSH')}
          labelText={t('Home.label.brush')}
        />
      </View>

      <View style={styles.button}>
        <Button
          // @ts-ignore
          name={ERASER.ERASER}
          backgroundColor={Object.keys(ERASER).includes(currentMapMemoTool) ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => pressMapMemoToolButton('ERASER')}
          labelText={t('Home.label.eraser')}
        />
      </View>
      <View style={styles.button}>
        <Button
          name="cog"
          backgroundColor={COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => openMapMemoSettingsTab(currentGroup)}
          labelText={t('Home.label.memoSetting')}
          labelFontSize={9}
        />
      </View>
      <View style={styles.button}>
        <Button
          name={MAPMEMOTOOL.COLOR}
          backgroundColor={COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => setVisibleMapMemoColor(true)}
          labelText={t('Home.label.color')}
        />
      </View>

      {Platform.OS === 'ios' && isTablet() && (
        <View style={styles.button}>
          <Button
            name={MAPMEMOTOOL.PENCIL_LOCK}
            backgroundColor={isPencilModeActive ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPress={togglePencilMode}
            labelText={t('Home.label.pencilLock')}
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
          labelText={t('Home.label.undo')}
          labelFontSize={9}
        />
      </View>
      <View style={styles.button}>
        <Button
          name={MAPMEMOTOOL.REDO}
          backgroundColor={isRedoable ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isRedoable}
          onPress={pressRedoMapMemo}
          labelText={t('Home.label.redo')}
          labelFontSize={9}
        />
      </View>
    </View>
  );
});
