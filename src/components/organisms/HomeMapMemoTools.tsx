import React, { useContext, useState } from 'react';
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
import { isBrushTool, isEraserTool, isMapMemoDrawTool, isStampTool } from '../../utils/General';
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

  //ツール選択パレット（横展開）の開閉
  const [isToolPaletteOpen, setToolPaletteOpen] = useState(false);
  const isToolActive = isMapMemoDrawTool(currentMapMemoTool);

  //集約ボタンに表示する現在グループのアイコンとラベル
  const groupIcon =
    currentGroup === 'PEN'
      ? MAPMEMOTOOL.PEN
      : currentGroup === 'STAMP'
      ? // @ts-ignore
        STAMP[currentMapMemoTool] || STAMP.STAMP
      : currentGroup === 'BRUSH'
      ? // @ts-ignore
        BRUSH[currentMapMemoTool] || BRUSH.BRUSH
      : // @ts-ignore
        ERASER[currentMapMemoTool] || ERASER.ERASER;
  const groupLabel =
    currentGroup === 'PEN'
      ? t('Home.label.pen')
      : currentGroup === 'STAMP'
      ? t('Home.label.stamp')
      : currentGroup === 'BRUSH'
      ? t('Home.label.brush')
      : t('Home.label.eraser');

  //集約ボタン: ツール有効中は解除のみ、無効中はパレットを開く
  const pressGroupButton = () => {
    if (isToolActive) {
      pressMapMemoToolButton(currentGroup);
    } else {
      setToolPaletteOpen(true);
    }
  };

  //パレットからグループを選択: 閉じてから選択（前回ツールの再選択 or 初回は設定を開く）
  const selectToolGroup = (group: MapMemoToolGroupType) => {
    setToolPaletteOpen(false);
    pressMapMemoToolButton(group);
  };

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

    toolButton: {
      marginRight: 5,
      width: 40,
    },
    toolRow: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
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
        {/* ペン・スタンプ・ブラシ・消しゴムは1ボタンに集約。
            ツール有効中に押すと解除のみ、無効中に押すと横に展開して選ぶ */}
        <View style={styles.toolRow}>
          {!isToolPaletteOpen ? (
            <View style={styles.toolButton}>
              <Button
                // @ts-ignore
                name={groupIcon}
                backgroundColor={isToolActive ? COLOR.ALFARED : COLOR.ALFABLUE}
                borderRadius={10}
                onPress={pressGroupButton}
                labelText={groupLabel}
                labelFontSize={currentGroup === 'STAMP' ? 9 : undefined}
              />
            </View>
          ) : (
            <>
              <View style={styles.toolButton}>
                <Button
                  name={MAPMEMOTOOL.PEN}
                  backgroundColor={COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={() => selectToolGroup('PEN')}
                  labelText={t('Home.label.pen')}
                />
              </View>
              <View style={styles.toolButton}>
                <Button
                  name={STAMP.STAMP}
                  backgroundColor={COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={() => selectToolGroup('STAMP')}
                  labelText={t('Home.label.stamp')}
                  labelFontSize={9}
                />
              </View>
              <View style={styles.toolButton}>
                <Button
                  name={BRUSH.BRUSH}
                  backgroundColor={COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={() => selectToolGroup('BRUSH')}
                  labelText={t('Home.label.brush')}
                />
              </View>
              <View style={styles.toolButton}>
                <Button
                  name={ERASER.ERASER}
                  backgroundColor={COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={() => selectToolGroup('ERASER')}
                  labelText={t('Home.label.eraser')}
                />
              </View>
            </>
          )}
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
