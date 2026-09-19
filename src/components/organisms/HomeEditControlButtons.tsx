import React, { useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { isPlotTool, isHandwritingTool } from '../../utils/General';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { t } from '../../i18n/config';
import { useHomeTopLayout } from '../../hooks/useHomeTopLayout';

//画面上部中央の確定・キャンセルバー。作図（点・線・面）とマップメモの編集選択で共通
export const HomeEditControlButtons = React.memo(() => {
  const { currentDrawTool, isEditingObject, pressSaveDraw, finishEditObject, cancelDraw } =
    useContext(DrawingToolsContext);
  const { editControlTop } = useHomeTopLayout();

  const styles = StyleSheet.create({
    //アイコン上・文字下の縦並び（Buttonアトムはアイコン下に極小ラベルを重ねる設計のため文字が重なる）
    editButton: {
      alignItems: 'center',
      borderRadius: 8,
      gap: 2,
      justifyContent: 'center',
      paddingVertical: 6,
      //文字数に関係なく2つのボタンの幅を揃える
      width: 84,
    },
    editButtonText: {
      color: COLOR.WHITE,
      fontSize: 12,
      fontWeight: 'bold',
    },
    editControlContainer: {
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'center',
      left: 0,
      paddingHorizontal: 20,
      position: 'absolute',
      right: 0,
      //編集レイヤチップのすぐ下に配置
      top: editControlTop,
    },
  });

  //地図移動ツールへ持ち替えている間も表示する。消えると編集が終わったように見え、
  //元のツールへ戻す必要があることに気づけないため（保存はfeatureButtonで分岐するのでMOVE中でも動く）
  if (
    !isEditingObject ||
    !(isPlotTool(currentDrawTool) || isHandwritingTool(currentDrawTool) || currentDrawTool === 'MOVE')
  )
    return null;

  return (
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
          //ツールボタンを押し直したときと同じ後始末。地図移動ツールへ持ち替えている間でもキャンセルできる
          cancelDraw();
        }}
      >
        <MaterialCommunityIcons name="close" size={18} color={COLOR.WHITE} />
        <Text style={styles.editButtonText} numberOfLines={1}>
          {t('common.cancel')}
        </Text>
      </Pressable>
    </View>
  );
});
