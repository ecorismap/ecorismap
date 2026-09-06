import React, { useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLOR, MAPMEMOTOOL, STAMP, BRUSH, ERASER } from '../../constants/AppConstants';

import { Button } from '../atoms';
import { MapMemoContext } from '../../contexts/MapMemo';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { HomeEditControlButtons } from './HomeEditControlButtons';
import { HomeEditingLayerButton } from './HomeEditingLayerButton';
import {
  DeleteToolButton,
  MoveToolButton,
  PencilLockButton,
  RedoToolButton,
  SelectToolButton,
  UndoToolButton,
} from './HomeCommonToolButtons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../i18n/config';
import { isBrushTool, isEraserTool, isStampTool } from '../../utils/General';
import { MapMemoToolGroupType } from '../../types';

export const HomeMapMemoTools = React.memo(() => {
  const { currentMapMemoTool, pressMapMemoToolButton, openMapMemoSettingsTab, setVisibleMapMemoColor } =
    useContext(MapMemoContext);
  const { currentDrawTool, isSelectedDraw } = useContext(DrawingToolsContext);

  //編集選択（なげなわ）による選択操作中か。選択中は選択系のボタンを追加表示する
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
  });

  return (
    <>
      {/* 編集選択の確定・キャンセルボタン */}
      <HomeEditControlButtons />

      {/* 編集レイヤ名の表示・切替チップ */}
      <HomeEditingLayerButton />
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

        <PencilLockButton />
        <SelectToolButton />
        {isSelectionMode && <MoveToolButton />}
        {isSelectedDraw && <DeleteToolButton />}
        {/* undo/redoは統一ハンドラ（選択操作中は作図編集、通常時はメモ書き込みの履歴）で必要なときだけ表示 */}
        <UndoToolButton />
        <RedoToolButton />
      </View>
    </>
  );
});
