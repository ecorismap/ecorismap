import React from 'react';
import { View, Text, StyleSheet, Modal, ScrollView } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { Pressable } from '../atoms/Pressable';
import { HandwritingSubToolType, ToolPaletteItemType } from '../../types';

interface Props {
  visible: boolean;
  items: ToolPaletteItemType[];
  selectedSubTool: HandwritingSubToolType | undefined;
  select: (item: ToolPaletteItemType) => void;
  close: () => void;
}

/**
 * まとめた道具から1つ選ぶモーダル（飛翔図の行動範囲＝ブラシ、行動位置＝スタンプ）。
 * 種類が多くツールバーには並べきれないので、ボタンは1つにして中身をここで選ぶ
 */
export const HomeModalSubToolPicker = React.memo((props: Props) => {
  const { visible, items, selectedSubTool, select, close } = props;

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <Pressable style={styles.overlay} onPress={close} disablePressedAnimation>
        <Pressable style={styles.card} onPress={() => {}} disablePressedAnimation>
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            {items.map((item) => (
              <View key={item.id} style={styles.item}>
                <Button
                  id={item.id}
                  // @ts-ignore アイコン名はパレット定義が持つ
                  name={item.icon}
                  backgroundColor={item.subTool === selectedSubTool ? COLOR.ALFARED : COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={() => select(item)}
                  labelText={item.label}
                  //一覧では正式名を出したいので省略せず、ボタン幅（44px）に収まるよう文字を縮める
                  //（「ホバリング」が9pxだとはみ出してアイコンに重なる）
                  labelFontSize={Math.min(9, Math.max(6, 42 / item.label.length))}
                  labelNumberOfLines={1}
                  size={22}
                />
              </View>
            ))}
          </ScrollView>
          <View style={styles.footerRow}>
            <Pressable style={styles.secondaryButton} onPress={close}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
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
    maxWidth: 360,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    shadowColor: COLOR.BLACK,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: '90%',
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  item: {
    margin: 6,
    width: 52,
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: COLOR.MODAL_OVERLAY,
    flex: 1,
    justifyContent: 'center',
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: COLOR.GRAY4,
    fontSize: 14,
  },
});
