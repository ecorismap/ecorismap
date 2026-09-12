import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { Button } from '../atoms';
import { COLOR, DRAWTOOL, MAPMEMOTOOL } from '../../constants/AppConstants';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { MapMemoContext } from '../../contexts/MapMemo';
import { isTablet } from 'react-native-device-info';
import { t } from '../../i18n/config';

//作図（点・線・面）とマップメモの両ツールバーで共通のボタン群。
//表示するかどうか（表示条件）は呼び出し側が持ち、並び順も呼び出し側で決める

const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    marginTop: 2,
    width: 40,
  },
});

export const SelectToolButton = React.memo(({ disabled = false }: { disabled?: boolean }) => {
  const { currentDrawTool, selectDrawTool } = useContext(DrawingToolsContext);
  return (
    <View style={styles.button}>
      <Button
        name={DRAWTOOL.SELECT}
        backgroundColor={currentDrawTool === 'SELECT' ? COLOR.ALFARED : disabled ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
        borderRadius={10}
        disabled={disabled}
        onPress={() => selectDrawTool('SELECT')}
        labelText={t('Home.label.select')}
        labelFontSize={9}
      />
    </View>
  );
});

export const MoveToolButton = React.memo(() => {
  const { currentDrawTool, selectDrawTool } = useContext(DrawingToolsContext);
  return (
    <View style={styles.button}>
      <Button
        name={DRAWTOOL.MOVE}
        backgroundColor={currentDrawTool === 'MOVE' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        disabled={false}
        onPress={() => selectDrawTool('MOVE')}
        labelText={t('Home.label.move')}
        labelFontSize={9}
      />
    </View>
  );
});

//Apple Pencil専用モード（iPadのみ表示）
export const PencilLockButton = React.memo(() => {
  const { isPencilModeActive, togglePencilMode } = useContext(MapMemoContext);
  if (!(Platform.OS === 'ios' && isTablet())) return null;
  return (
    <View style={styles.button}>
      <Button
        name={MAPMEMOTOOL.PENCIL_LOCK}
        backgroundColor={isPencilModeActive ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPress={togglePencilMode}
        labelText={t('Home.label.pencilLock')}
      />
    </View>
  );
});

//undo/redoは実行できるときだけ表示する。履歴の切替（作図編集/メモ書き込み）は統一ハンドラ側で行う
export const UndoToolButton = React.memo(() => {
  const { isUndoAvailable, pressUndo } = useContext(DrawingToolsContext);
  if (!isUndoAvailable) return null;
  return (
    <View style={styles.button}>
      <Button
        name={DRAWTOOL.UNDO}
        backgroundColor={COLOR.ALFABLUE}
        borderRadius={10}
        onPress={pressUndo}
        labelText={t('Home.label.undo')}
        labelFontSize={9}
      />
    </View>
  );
});

export const RedoToolButton = React.memo(() => {
  const { isRedoAvailable, pressRedo } = useContext(DrawingToolsContext);
  if (!isRedoAvailable) return null;
  return (
    <View style={styles.button}>
      <Button
        name={DRAWTOOL.REDO}
        backgroundColor={COLOR.ALFABLUE}
        borderRadius={10}
        onPress={pressRedo}
        labelText={t('Home.label.redo')}
        labelFontSize={9}
      />
    </View>
  );
});

export const DeleteToolButton = React.memo(() => {
  const { pressDeleteDraw } = useContext(DrawingToolsContext);
  return (
    <View style={styles.button}>
      <Button
        name={DRAWTOOL.DELETE}
        backgroundColor={COLOR.ALFABLUE}
        borderRadius={10}
        disabled={false}
        onPress={pressDeleteDraw}
        labelText={t('Home.label.delete')}
      />
    </View>
  );
});
