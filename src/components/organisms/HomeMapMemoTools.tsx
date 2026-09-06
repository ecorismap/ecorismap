import React, { useContext } from 'react';
import { StyleSheet, Text, View, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR, DRAWTOOL, MAPMEMOTOOL, STAMP, BRUSH, ERASER } from '../../constants/AppConstants';

import { Button } from '../atoms';
import { Pressable } from '../atoms/Pressable';
import { MapMemoContext } from '../../contexts/MapMemo';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTablet } from 'react-native-device-info';
import { t } from 'i18next';
import { isBrushTool, isEraserTool, isPlotTool, isStampTool } from '../../utils/General';
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
  const {
    currentDrawTool,
    selectDrawTool,
    isEditingObject,
    isSelectedDraw,
    isUndoable: isDrawUndoable,
    isRedoable: isDrawRedoable,
    pressUndoDraw,
    pressRedoDraw,
    pressDeleteDraw,
    pressSaveDraw,
    finishEditObject,
  } = useContext(DrawingToolsContext);

  //編集選択（なげなわ）による選択操作中か。選択中はメモの描画ツールの代わりに選択系のボタンを出す
  const isSelectionMode = currentDrawTool === 'SELECT' || isSelectedDraw;

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
    //確定・キャンセル（HomeDrawToolsと同じ体裁）
    editControlContainer: {
      flexDirection: 'row',
      position: 'absolute',
      top: insets.top + 60,
      left: 0,
      right: 0,
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 20,
    },
    editButton: {
      alignItems: 'center',
      borderRadius: 8,
      gap: 2,
      justifyContent: 'center',
      paddingVertical: 6,
      width: 84,
    },
    editButtonText: {
      color: COLOR.WHITE,
      fontSize: 12,
      fontWeight: 'bold',
    },
  });

  return (
    <>
      {/* 編集選択の確定・キャンセルボタン */}
      {isEditingObject && isPlotTool(currentDrawTool) && (
        <View style={styles.editControlContainer}>
          <Pressable
            style={[styles.editButton, { backgroundColor: COLOR.BLUE }]}
            onPress={async () => {
              const saved = await pressSaveDraw();
              if (saved) {
                finishEditObject();
              }
            }}
          >
            <MaterialCommunityIcons name="check" size={18} color={COLOR.WHITE} />
            <Text style={styles.editButtonText} numberOfLines={1}>
              {t('common.finish')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.editButton, { backgroundColor: COLOR.RED }]}
            onPress={() => {
              selectDrawTool(currentDrawTool); //選択の破棄（resetDrawToolsも内部で呼ばれる）
            }}
          >
            <MaterialCommunityIcons name="close" size={18} color={COLOR.WHITE} />
            <Text style={styles.editButtonText} numberOfLines={1}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        </View>
      )}
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
          name={DRAWTOOL.SELECT}
          backgroundColor={currentDrawTool === 'SELECT' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => selectDrawTool('SELECT')}
          labelText={t('Home.label.select')}
          labelFontSize={9}
        />
      </View>
      {isSelectionMode && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.MOVE}
            backgroundColor={currentDrawTool === 'MOVE' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPress={() => selectDrawTool('MOVE')}
            labelText={t('Home.label.move')}
            labelFontSize={9}
          />
        </View>
      )}
      {isSelectedDraw && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.DELETE}
            backgroundColor={COLOR.ALFABLUE}
            borderRadius={10}
            onPress={pressDeleteDraw}
            labelText={t('Home.label.delete')}
          />
        </View>
      )}
      {/* 選択操作中は選択のundo/redo、通常時はメモ書き込みのundo/redoを必要なときだけ表示する */}
      {(isSelectionMode ? isDrawUndoable : isUndoable) && (
        <View style={styles.button}>
          <Button
            name={MAPMEMOTOOL.UNDO}
            backgroundColor={COLOR.ALFABLUE}
            borderRadius={10}
            onPress={isSelectionMode ? pressUndoDraw : pressUndoMapMemo}
            labelText={t('Home.label.undo')}
            labelFontSize={9}
          />
        </View>
      )}
      {(isSelectionMode ? isDrawRedoable : isRedoable) && (
        <View style={styles.button}>
          <Button
            name={MAPMEMOTOOL.REDO}
            backgroundColor={COLOR.ALFABLUE}
            borderRadius={10}
            onPress={isSelectionMode ? pressRedoDraw : pressRedoMapMemo}
            labelText={t('Home.label.redo')}
            labelFontSize={9}
          />
        </View>
      )}
    </View>
    </>
  );
});
