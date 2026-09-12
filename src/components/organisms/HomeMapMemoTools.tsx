import React, { useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLOR, ERASER, MAPMEMOTOOL, PEN_STYLE, PEN_WIDTH } from '../../constants/AppConstants';

import { Button } from '../atoms';
import { MapMemoContext } from '../../contexts/MapMemo';
import { PencilLockButton, RedoToolButton, UndoToolButton } from './HomeCommonToolButtons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../i18n/config';
import { isEraserTool, isPenTool } from '../../utils/General';
import { ArrowStyleType, PenWidthType } from '../../types';

//矢印は押すたびに なし→終端→両側 と一巡する
const ARROW_STYLES: { style: ArrowStyleType; icon: string; labelKey: string }[] = [
  { style: 'NONE', icon: PEN_STYLE.NONE, labelKey: 'Home.penPicker.none' },
  { style: 'ARROW_END', icon: PEN_STYLE.ARROW_END, labelKey: 'Home.penPicker.end' },
  { style: 'ARROW_BOTH', icon: PEN_STYLE.ARROW_BOTH, labelKey: 'Home.penPicker.bothSides' },
];
//太さは押すたびに細→中→太→極太と一巡する
const PEN_WIDTHS: PenWidthType[] = ['PEN_THIN', 'PEN_MEDIUM', 'PEN_THICK', 'PEN_EXTRA_THICK'];
const PEN_WIDTH_LABEL_KEYS: { [key in PenWidthType]: string } = {
  PEN_THIN: 'Home.penPicker.thin',
  PEN_MEDIUM: 'Home.penPicker.medium',
  PEN_THICK: 'Home.penPicker.thick',
  PEN_EXTRA_THICK: 'Home.penPicker.extraThick',
};

/**
 * メモのツールバー。書き込みに必要なペン・消しゴム・直線/曲線・矢印・太さ・色だけを並べる。
 * スタンプ・ブラシ・矢印・編集選択は飛翔図（LINEタブの手書き）側の機能なのでここには出さない。
 * 色以外はモーダルを出さず、ボタンを押すたびに切り替わる（今の状態はアイコンとラベルで示す）。
 * 消しゴムはなぞった部分だけを消す1種類だけ
 */
export const HomeMapMemoTools = React.memo(() => {
  const {
    currentMapMemoTool,
    currentPenWidth,
    isStraightStyle,
    setIsStraightStyle,
    arrowStyle,
    setArrowStyle,
    setPenWidth,
    selectMapMemoTool,
    setVisibleMapMemoColor,
  } = useContext(MapMemoContext);

  const insets = useSafeAreaInsets();

  const isPenActive = isPenTool(currentMapMemoTool);
  const isEraserActive = isEraserTool(currentMapMemoTool);

  const arrowIndex = Math.max(
    ARROW_STYLES.findIndex((a) => a.style === arrowStyle),
    0
  );
  const arrow = ARROW_STYLES[arrowIndex];
  const pressArrowStyle = () => {
    setArrowStyle(ARROW_STYLES[(arrowIndex + 1) % ARROW_STYLES.length].style);
  };

  const pressPenWidth = () => {
    const index = PEN_WIDTHS.indexOf(currentPenWidth);
    setPenWidth(PEN_WIDTHS[(index + 1) % PEN_WIDTHS.length]);
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
  });

  return (
    <View style={styles.buttonContainer}>
      <View style={styles.button}>
        <Button
          name={MAPMEMOTOOL.PEN}
          backgroundColor={isPenActive ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => selectMapMemoTool(isPenActive ? undefined : 'PEN')}
          labelText={t('Home.label.pen')}
        />
      </View>
      <View style={styles.button}>
        <Button
          name={ERASER.ERASER}
          backgroundColor={isEraserActive ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          //消しゴムはなぞった部分だけを消す1種類だけ
          onPress={() => selectMapMemoTool(isEraserActive ? undefined : 'PEN_ERASER_PARTIAL')}
          labelText={t('Home.label.eraser')}
        />
      </View>
      <View style={styles.button}>
        <Button
          //現在の太さをアイコンとラベルで示し、タップで細→中→太→極太と切り替える
          name={PEN_WIDTH[currentPenWidth]}
          backgroundColor={COLOR.ALFABLUE}
          borderRadius={10}
          onPress={pressPenWidth}
          labelText={t(PEN_WIDTH_LABEL_KEYS[currentPenWidth])}
        />
      </View>
      <View style={styles.button}>
        <Button
          //現在の描き方をアイコンとラベルで示し、タップで直線⇔曲線を切り替える
          name={isStraightStyle ? PEN_STYLE.STRAIGHT : PEN_STYLE.FREEHAND}
          backgroundColor={COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => setIsStraightStyle(!isStraightStyle)}
          labelText={isStraightStyle ? t('Home.penPicker.straight') : t('Home.penPicker.curve')}
        />
      </View>
      <View style={styles.button}>
        <Button
          //現在の矢印をアイコンとラベルで示し、タップで なし→終端→両側 と切り替える
          name={arrow.icon}
          backgroundColor={COLOR.ALFABLUE}
          borderRadius={10}
          onPress={pressArrowStyle}
          labelText={t(arrow.labelKey)}
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
      {/* undo/redoは書き込みの履歴。必要なときだけ表示される */}
      <UndoToolButton />
      <RedoToolButton />
    </View>
  );
});
