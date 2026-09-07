import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal } from 'react-native';
import ColorPicker, { Panel2, BrightnessSlider, Swatches, OpacitySlider, colorKit } from 'reanimated-color-picker';
import { COLOR, PEN_STYLE, PEN_WIDTH } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { ArrowStyleType, PenWidthType } from '../../types';
import Button from '../atoms/Button';
import { Pressable } from '../atoms/Pressable';

const customSwatches = [
  '#000000b3',
  '#0000ffb3',
  '#33ccffb3',
  '#008000b3',
  '#b8d200b3',
  '#ffff00b3',
  '#FFA500b3',
  '#996633b3',
  '#FFB6C1b3',
  '#ff00ccb3',
  '#ff0000b3',
  '#ffffffb3',
];

type StyleTabType = 'WIDTH' | 'ARROW' | 'COLOR';

interface Props {
  visible: boolean;
  //矢印タブを表示するか（LINEのみ）
  showArrow: boolean;
  initialPenWidth: PenWidthType;
  initialArrowStyle: ArrowStyleType;
  //色ピッカーの初期色。単一オブジェクト選択中はそのオブジェクトの色（プロパティパネル方式）
  initialColor: string;
  selectPenWidth: (width: PenWidthType) => void;
  selectArrowStyle: (style: ArrowStyleType) => void;
  selectColor: (hue: number, sat: number, val: number, alpha: number) => void;
  close: () => void;
}

//タブを切り替えても高さが変わらないよう、コンテンツ領域は固定高にする（色ピッカーに合わせる）
const CONTENT_HEIGHT = 340;

/**
 * スタイル設定モーダル（太さ/矢印/色をタブで切替）。
 * マップメモの設定モーダルと同じデザイン・OKで確定/Cancelで変更なしの流儀に合わせる。
 * 操作したタブの値だけをOKで反映する（プロパティパネル方式: 触っていない項目は変更しない）
 */
export const HomeModalStyleSettings = React.memo((props: Props) => {
  const {
    visible,
    showArrow,
    initialPenWidth,
    initialArrowStyle,
    initialColor,
    selectPenWidth,
    selectArrowStyle,
    selectColor,
    close,
  } = props;

  const [tab, setTab] = useState<StyleTabType>('WIDTH');
  const [penWidth, setPenWidth] = useState<PenWidthType>('PEN_MEDIUM');
  const [arrowStyle, setArrowStyle] = useState<ArrowStyleType>('NONE');
  const [hue, setHue] = useState(0);
  const [sat, setSat] = useState(1);
  const [val, setVal] = useState(1);
  const [alpha, setAlpha] = useState(0.7);
  //色を操作したか。初期色の読み込みでは立てず、ピッカー操作で立てる
  const [colorTouched, setColorTouched] = useState(false);

  const applyHexToHsv = useCallback((hex: string) => {
    const hsv = colorKit.HSV(hex).object();
    setHue(hsv.h);
    setSat(hsv.s / 100);
    setVal(hsv.v / 100);
    setAlpha(hsv.a);
  }, []);

  useEffect(() => {
    if (visible) {
      setTab('WIDTH');
      setPenWidth(initialPenWidth);
      setArrowStyle(initialArrowStyle);
      applyHexToHsv(initialColor);
      setColorTouched(false);
    }
  }, [visible, initialPenWidth, initialArrowStyle, initialColor, applyHexToHsv]);

  const onPickColor = useCallback(
    ({ hex }: { hex: string }) => {
      applyHexToHsv(hex);
      setColorTouched(true);
    },
    [applyHexToHsv]
  );

  const handleOK = () => {
    //操作した項目だけ反映する（触っていない項目でグローバル設定を上書きしない）
    if (penWidth !== initialPenWidth) selectPenWidth(penWidth);
    if (showArrow && arrowStyle !== initialArrowStyle) selectArrowStyle(arrowStyle);
    if (colorTouched) selectColor(hue, sat, val, alpha);
    close();
  };

  const optionButton = (id: string, icon: string, selected: boolean, onPress: () => void, label?: string) => (
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

  const tabs: { key: StyleTabType; label: string }[] = [
    { key: 'WIDTH', label: t('common.strokeWidth') },
    ...(showArrow ? [{ key: 'ARROW' as StyleTabType, label: t('common.arrow') }] : []),
    { key: 'COLOR', label: t('common.color') },
  ];

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <Pressable style={styles.overlay} onPress={close} disablePressedAnimation>
        <Pressable style={styles.card} onPress={() => {}} disablePressedAnimation>
          <View style={styles.segmentContainer}>
            {tabs.map(({ key, label }) => (
              <Pressable
                key={key}
                style={[styles.segment, tab === key && styles.segmentActive]}
                onPress={() => tab !== key && setTab(key)}
                disablePressedAnimation
              >
                <Text style={[styles.segmentLabel, tab === key && styles.segmentLabelActive]}>{label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.contentArea}>
            {tab === 'WIDTH' && (
              <View style={styles.tabContent}>
                <View style={styles.optionRow}>
                  {optionButton('PEN_THIN', PEN_WIDTH.PEN_THIN, penWidth === 'PEN_THIN', () => setPenWidth('PEN_THIN'), t('Home.penPicker.thin'))}
                  {optionButton('PEN_MEDIUM', PEN_WIDTH.PEN_MEDIUM, penWidth === 'PEN_MEDIUM', () => setPenWidth('PEN_MEDIUM'), t('Home.penPicker.medium'))}
                  {optionButton('PEN_THICK', PEN_WIDTH.PEN_THICK, penWidth === 'PEN_THICK', () => setPenWidth('PEN_THICK'), t('Home.penPicker.thick'))}
                </View>
              </View>
            )}
            {tab === 'ARROW' && (
              <View style={styles.tabContent}>
                <View style={styles.optionRow}>
                  {optionButton('NONE', PEN_STYLE.NONE, arrowStyle === 'NONE', () => setArrowStyle('NONE'), t('Home.penPicker.none'))}
                  {optionButton('ARROW_END', PEN_STYLE.ARROW_END, arrowStyle === 'ARROW_END', () => setArrowStyle('ARROW_END'), t('Home.penPicker.end'))}
                  {optionButton('ARROW_BOTH', PEN_STYLE.ARROW_BOTH, arrowStyle === 'ARROW_BOTH', () => setArrowStyle('ARROW_BOTH'), t('Home.penPicker.bothSides'))}
                </View>
              </View>
            )}
            {tab === 'COLOR' && (
              <View style={styles.colorTabContent}>
                <ColorPicker
                  value={initialColor}
                  sliderThickness={20}
                  thumbSize={25}
                  thumbShape="circle"
                  // onComplete/onChangeはworklet専用。通常のJS関数はonCompleteJSに渡さないとクラッシュする
                  onCompleteJS={onPickColor}
                  style={styles.colorPicker}
                >
                  <View style={styles.panelBrightnessContainer}>
                    <Panel2 style={[styles.panel, styles.shadow]} />
                    <BrightnessSlider style={[styles.brightnessSlider, styles.shadow]} vertical reverse />
                  </View>
                  <OpacitySlider style={styles.opacitySlider} />
                  <Swatches style={styles.swatches} swatchStyle={styles.swatchStyle} colors={customSwatches} />
                </ColorPicker>
              </View>
            )}
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
  brightnessSlider: {
    height: '100%',
  },
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
  colorPicker: {
    justifyContent: 'center',
    width: '80%',
  },
  colorTabContent: {
    alignItems: 'center',
    paddingTop: 10,
  },
  contentArea: {
    height: CONTENT_HEIGHT,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 12,
  },
  opacitySlider: {
    marginBottom: 20,
    marginTop: 0,
  },
  optionButton: {
    alignItems: 'center',
    marginRight: 10,
    width: 60,
  },
  optionRow: {
    flexDirection: 'row',
    marginBottom: 8,
    marginTop: 10,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: COLOR.MODAL_OVERLAY,
    flex: 1,
    justifyContent: 'center',
  },
  panel: {
    flex: 1,
    height: 150,
    marginEnd: 20,
  },
  panelBrightnessContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    marginBottom: 20,
    marginTop: 15,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: COLOR.BLUE,
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    width: 110,
  },
  primaryButtonText: {
    color: COLOR.WHITE,
    fontWeight: 'bold',
  },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderRadius: 10,
    height: 44,
    justifyContent: 'center',
    width: 110,
  },
  secondaryButtonText: {
    color: COLOR.BLACK,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    paddingVertical: 8,
  },
  segmentActive: {
    backgroundColor: COLOR.BLUE,
  },
  segmentContainer: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 10,
    flexDirection: 'row',
    marginBottom: 8,
    padding: 4,
  },
  segmentLabel: {
    color: COLOR.GRAY4,
    fontSize: 14,
  },
  segmentLabelActive: {
    color: COLOR.WHITE,
    fontWeight: 'bold',
  },
  shadow: {
    elevation: 5,
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  swatches: {
    justifyContent: 'space-between',
    marginTop: 0,
  },
  tabContent: {
    paddingHorizontal: 4,
  },
  swatchStyle: {
    borderRadius: 5,
    height: 18,
    width: 18,
  },
});
