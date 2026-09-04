import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { BRUSH, COLOR, PEN_STYLE, PEN_WIDTH, STAMP } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { ArrowStyleType, MapMemoToolGroupType, MapMemoToolType, PenWidthType } from '../../types';
import Button from '../atoms/Button';
import { CheckBox } from '../molecules/CheckBox';
import { Pressable } from '../atoms/Pressable';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';
import { isBrushTool, isEraserTool, isStampTool } from '../../utils/General';

interface Props {
  visible: boolean;
  tab: MapMemoToolGroupType;
  currentMapMemoTool: MapMemoToolType;
  currentPenWidth: PenWidthType;
  arrowStyle: ArrowStyleType;
  isStraightStyle: boolean;
  snapWithLine: boolean;
  selectMapMemoTool: (tool: MapMemoToolType | undefined) => void;
  selectMapMemoPenWidth: (penWidth: PenWidthType) => void;
  selectMapMemoArrowStyle: (arrowStyle: ArrowStyleType) => void;
  selectMapMemoStraightStyle: (straightStyle: boolean) => void;
  selectMapMemoSnapWithLine: (snapWithLine: boolean) => void;
  setTab: (tab: MapMemoToolGroupType) => void;
  close: () => void;
}

const TABS: { key: MapMemoToolGroupType; labelKey: string }[] = [
  { key: 'PEN', labelKey: 'Home.label.pen' },
  { key: 'STAMP', labelKey: 'Home.label.stamp' },
  { key: 'BRUSH', labelKey: 'Home.label.brush' },
  { key: 'ERASER', labelKey: 'Home.label.eraser' },
];

//消しゴムのアイコン（他タブと同じアイコンボタン形式で表示する）
const ERASER_ICONS: { [key: string]: string } = {
  PEN_ERASER: 'eraser',
  PEN_ERASER_PARTIAL: 'eraser-variant',
  BRUSH_ERASER: 'brush',
  STAMP_ERASER: 'stamper',
};

//タブを切り替えても高さが変わらないよう、コンテンツ領域は固定高にする
const CONTENT_HEIGHT = 330;

/**
 * マップメモの設定モーダル（ペン/スタンプ/ブラシ/消しゴムをタブで切替）。
 * どのタブも選択はハイライトのみで、OKで確定・Cancelで変更なしに統一。
 * StyledDialogのデザイントークン（角丸20・白カード・プライマリボタン）に合わせている。
 * ローカル入力stateを持つため、useModalYieldingToDialogは使わない（規律コメント参照）
 */
export const HomeModalMapMemoSettings = React.memo((props: Props) => {
  const {
    visible,
    tab,
    currentMapMemoTool,
    currentPenWidth,
    arrowStyle,
    isStraightStyle,
    snapWithLine,
    selectMapMemoTool,
    selectMapMemoPenWidth,
    selectMapMemoArrowStyle,
    selectMapMemoStraightStyle,
    selectMapMemoSnapWithLine,
    setTab,
    close,
  } = props;
  const { hisyouTool } = useFeatureFlags();

  //各タブのローカル編集state（OKで確定）
  const [penWidth, setPenWidth] = useState<PenWidthType>('PEN_MEDIUM');
  const [arrowStyle_, setArrowStyle] = useState<ArrowStyleType>('NONE');
  const [straightStyle, setStraightStyle] = useState(false);
  const [stampSel, setStampSel] = useState<MapMemoToolType | undefined>(undefined);
  const [brushSel, setBrushSel] = useState<MapMemoToolType | undefined>(undefined);
  const [eraserSel, setEraserSel] = useState<MapMemoToolType>('PEN_ERASER');
  const [snapped, setSnapped] = useState(true);

  useEffect(() => {
    if (visible) {
      setPenWidth(currentPenWidth);
      setArrowStyle(arrowStyle);
      setStraightStyle(isStraightStyle);
      setSnapped(snapWithLine);
      setStampSel(isStampTool(currentMapMemoTool) ? currentMapMemoTool : undefined);
      setBrushSel(isBrushTool(currentMapMemoTool) ? currentMapMemoTool : undefined);
      setEraserSel(isEraserTool(currentMapMemoTool) ? currentMapMemoTool : 'PEN_ERASER');
    }
  }, [visible, arrowStyle, currentMapMemoTool, currentPenWidth, isStraightStyle, snapWithLine]);

  const handleOK = () => {
    if (tab === 'PEN') {
      selectMapMemoTool('PEN');
      selectMapMemoPenWidth(penWidth);
      selectMapMemoArrowStyle(arrowStyle_);
      selectMapMemoStraightStyle(straightStyle);
    } else if (tab === 'STAMP') {
      if (stampSel !== undefined) {
        selectMapMemoTool(stampSel);
        selectMapMemoSnapWithLine(snapped);
      }
    } else if (tab === 'BRUSH') {
      if (brushSel !== undefined) selectMapMemoTool(brushSel);
    } else if (tab === 'ERASER') {
      selectMapMemoTool(eraserSel);
    }
    close();
  };

  const optionButton = (
    id: MapMemoToolType | string,
    icon: string,
    selected: boolean,
    onPress: () => void,
    label?: string
  ) => (
    <View style={styles.optionButton} key={id}>
      <Button
        id={id}
        name={icon}
        backgroundColor={selected ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPress={onPress}
        labelText={label}
        size={22}
      />
    </View>
  );

  const renderPenTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.sectionLabel}>{t('common.strokeWidth')}</Text>
      <View style={styles.optionRow}>
        {optionButton('PEN_THIN', PEN_WIDTH.PEN_THIN, penWidth === 'PEN_THIN', () => setPenWidth('PEN_THIN'), t('Home.penPicker.thin'))}
        {optionButton('PEN_MEDIUM', PEN_WIDTH.PEN_MEDIUM, penWidth === 'PEN_MEDIUM', () => setPenWidth('PEN_MEDIUM'), t('Home.penPicker.medium'))}
        {optionButton('PEN_THICK', PEN_WIDTH.PEN_THICK, penWidth === 'PEN_THICK', () => setPenWidth('PEN_THICK'), t('Home.penPicker.thick'))}
      </View>
      <Text style={styles.sectionLabel}>{t('common.straight_curve')}</Text>
      <View style={styles.optionRow}>
        {optionButton('FREEHAND', PEN_STYLE.FREEHAND, !straightStyle, () => setStraightStyle(false), t('Home.penPicker.curve'))}
        {optionButton('STRAIGHT', PEN_STYLE.STRAIGHT, straightStyle, () => setStraightStyle(true), t('Home.penPicker.straight'))}
      </View>
      <Text style={styles.sectionLabel}>{t('common.arrow')}</Text>
      <View style={styles.optionRow}>
        {optionButton('NONE', PEN_STYLE.NONE, arrowStyle_ === 'NONE', () => setArrowStyle('NONE'), t('Home.penPicker.none'))}
        {optionButton('ARROW_END', PEN_STYLE.ARROW_END, arrowStyle_ === 'ARROW_END', () => setArrowStyle('ARROW_END'), t('Home.penPicker.end'))}
        {optionButton('ARROW_BOTH', PEN_STYLE.ARROW_BOTH, arrowStyle_ === 'ARROW_BOTH', () => setArrowStyle('ARROW_BOTH'), t('Home.penPicker.bothSides'))}
      </View>
    </View>
  );

  const renderStampTab = () => (
    <View style={styles.tabContent}>
      {hisyouTool && (
        <>
          <Text style={styles.sectionLabel}>飛翔図</Text>
          <View style={styles.optionRow}>
            {optionButton('TOMARI', STAMP.TOMARI, stampSel === 'TOMARI', () => setStampSel('TOMARI'), 'とまり')}
            {optionButton('KARI', STAMP.KARI, stampSel === 'KARI', () => setStampSel('KARI'), '狩り')}
            {optionButton('KOUBI', STAMP.KOUBI, stampSel === 'KOUBI', () => setStampSel('KOUBI'), '交尾')}
            {optionButton('VOICE', STAMP.VOICE, stampSel === 'VOICE', () => setStampSel('VOICE'), '声のみ')}
          </View>
        </>
      )}
      <Text style={styles.sectionLabel}>{t('common.common')}</Text>
      <View style={styles.optionRow}>
        {optionButton('CIRCLE', STAMP.CIRCLE, stampSel === 'CIRCLE', () => setStampSel('CIRCLE'))}
        {optionButton('TRIANGLE', STAMP.TRIANGLE, stampSel === 'TRIANGLE', () => setStampSel('TRIANGLE'))}
        {optionButton('SQUARE', STAMP.SQUARE, stampSel === 'SQUARE', () => setStampSel('SQUARE'))}
      </View>
      <View style={styles.checkboxRow}>
        <CheckBox
          label={t('common.snapWithLine')}
          style={{ backgroundColor: COLOR.WHITE }}
          labelColor="black"
          width={280}
          checked={snapped}
          onCheck={setSnapped}
        />
      </View>
    </View>
  );

  const renderBrushTab = () => (
    <View style={styles.tabContent}>
      {hisyouTool && (
        <>
          <Text style={styles.sectionLabel}>飛翔図</Text>
          <View style={styles.optionRow}>
            {optionButton('SENKAI', BRUSH.SENKAI, brushSel === 'SENKAI', () => setBrushSel('SENKAI'), '旋回')}
            {optionButton('SENJYOU', BRUSH.SENJYOU, brushSel === 'SENJYOU', () => setBrushSel('SENJYOU'), '旋上')}
            {optionButton('KYUKOKA', BRUSH.KYUKOKA, brushSel === 'KYUKOKA', () => setBrushSel('KYUKOKA'), '急降下')}
          </View>
          <View style={styles.optionRow}>
            {optionButton('DISPLAY1', BRUSH.DISPLAY1, brushSel === 'DISPLAY1', () => setBrushSel('DISPLAY1'), '誇示1')}
            {optionButton('DISPLAY2', BRUSH.DISPLAY2, brushSel === 'DISPLAY2', () => setBrushSel('DISPLAY2'), '誇示2')}
            {optionButton('KOUGEKI', BRUSH.KOUGEKI, brushSel === 'KOUGEKI', () => setBrushSel('KOUGEKI'), '排斥')}
          </View>
          <View style={styles.optionRow}>
            {optionButton('TANJI', BRUSH.TANJI, brushSel === 'TANJI', () => setBrushSel('TANJI'), '探餌')}
            {optionButton('ESA', BRUSH.ESA, brushSel === 'ESA', () => setBrushSel('ESA'), '餌運搬')}
            {optionButton('SUZAI', BRUSH.SUZAI, brushSel === 'SUZAI', () => setBrushSel('SUZAI'), '巣材運搬')}
          </View>
        </>
      )}
      <Text style={styles.sectionLabel}>{t('common.common')}</Text>
      <View style={styles.optionRow}>
        {optionButton('PLUS', BRUSH.PLUS, brushSel === 'PLUS', () => setBrushSel('PLUS'))}
        {optionButton('CROSS', BRUSH.CROSS, brushSel === 'CROSS', () => setBrushSel('CROSS'))}
      </View>
    </View>
  );

  const renderEraserTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.optionRow}>
        {optionButton('PEN_ERASER', ERASER_ICONS.PEN_ERASER, eraserSel === 'PEN_ERASER', () => setEraserSel('PEN_ERASER'), t('Home.eraserPicker.line'))}
        {optionButton('PEN_ERASER_PARTIAL', ERASER_ICONS.PEN_ERASER_PARTIAL, eraserSel === 'PEN_ERASER_PARTIAL', () => setEraserSel('PEN_ERASER_PARTIAL'), t('Home.eraserPicker.partial'))}
        {optionButton('BRUSH_ERASER', ERASER_ICONS.BRUSH_ERASER, eraserSel === 'BRUSH_ERASER', () => setEraserSel('BRUSH_ERASER'), t('Home.eraserPicker.brush'))}
        {optionButton('STAMP_ERASER', ERASER_ICONS.STAMP_ERASER, eraserSel === 'STAMP_ERASER', () => setEraserSel('STAMP_ERASER'), t('Home.eraserPicker.stamp'))}
      </View>
      <Text style={styles.eraserDescription}>{t(`Home.eraserPicker.description_${eraserSel}`)}</Text>
    </View>
  );

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <Pressable style={styles.overlay} onPress={close} disablePressedAnimation>
        <Pressable style={styles.card} onPress={() => {}} disablePressedAnimation>
          <View style={styles.segmentContainer}>
            {TABS.map(({ key, labelKey }) => (
              <Pressable
                key={key}
                style={[styles.segment, tab === key && styles.segmentActive]}
                onPress={() => tab !== key && setTab(key)}
                disablePressedAnimation
              >
                <Text style={[styles.segmentLabel, tab === key && styles.segmentLabelActive]}>{t(labelKey)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.contentArea}>
            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
              {tab === 'PEN' && renderPenTab()}
              {tab === 'STAMP' && renderStampTab()}
              {tab === 'BRUSH' && renderBrushTab()}
              {tab === 'ERASER' && renderEraserTab()}
            </ScrollView>
          </View>
          <View style={styles.footerRow}>
            <Pressable style={styles.secondaryButton} onPress={close}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={handleOK}>
              <Text style={styles.primaryButtonText}>OK</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLOR.WHITE,
    borderRadius: 20,
    elevation: 5,
    maxWidth: 340,
    paddingHorizontal: 20,
    paddingVertical: 20,
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    width: '85%',
  },
  checkboxRow: {
    alignItems: 'flex-start',
    marginTop: 8,
  },
  contentArea: {
    height: CONTENT_HEIGHT,
    marginTop: 14,
  },
  eraserDescription: {
    color: COLOR.GRAY4,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 10,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  optionButton: {
    margin: 5,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 6,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: COLOR.MODAL_OVERLAY,
    flex: 1,
    justifyContent: 'center',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: COLOR.BLUE,
    borderRadius: 12,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryButtonText: {
    color: COLOR.WHITE,
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollContent: {
    flexGrow: 1,
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.GRAY2,
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryButtonText: {
    color: COLOR.GRAY4,
    fontSize: 16,
    fontWeight: 'bold',
  },
  sectionLabel: {
    alignSelf: 'flex-start',
    color: COLOR.GRAY4,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
    marginTop: 8,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 9,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  segmentActive: {
    backgroundColor: COLOR.WHITE,
    elevation: 2,
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
  },
  segmentContainer: {
    backgroundColor: COLOR.GRAY1,
    borderRadius: 12,
    flexDirection: 'row',
    padding: 3,
  },
  segmentLabel: {
    color: COLOR.GRAY3,
    fontSize: 12,
  },
  segmentLabelActive: {
    color: COLOR.BLUE,
    fontWeight: 'bold',
  },
  tabContent: {
    flex: 1,
  },
});
