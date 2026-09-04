import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { Pressable } from '../atoms/Pressable';
import { MapMemoToolGroupType } from '../../types';

interface Props {
  active: MapMemoToolGroupType;
  onSelect: (group: MapMemoToolGroupType) => void;
}

const TABS: { key: MapMemoToolGroupType; labelKey: string }[] = [
  { key: 'PEN', labelKey: 'Home.label.pen' },
  { key: 'STAMP', labelKey: 'Home.label.stamp' },
  { key: 'BRUSH', labelKey: 'Home.label.brush' },
  { key: 'ERASER', labelKey: 'Home.label.eraser' },
];

/**
 * マップメモ設定モーダル共通のタブバー。
 * 各ピッカーモーダルの上部に置き、モーダルを閉じずに他ツールの設定へ切り替える
 */
export const MapMemoToolTabBar = React.memo(({ active, onSelect }: Props) => {
  return (
    <View style={styles.container}>
      {TABS.map(({ key, labelKey }) => (
        <Pressable
          key={key}
          style={[styles.tab, active === key && styles.activeTab]}
          onPress={() => active !== key && onSelect(key)}
          disablePressedAnimation
        >
          <Text style={[styles.label, active === key && styles.activeLabel]}>{t(labelKey)}</Text>
        </Pressable>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  activeLabel: {
    color: COLOR.BLACK,
    fontWeight: 'bold',
  },
  activeTab: {
    borderBottomColor: COLOR.RED,
    borderBottomWidth: 2,
  },
  container: {
    borderBottomColor: COLOR.GRAY1,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
  },
  label: {
    color: COLOR.GRAY3,
    fontSize: 14,
  },
  tab: {
    marginHorizontal: 2,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
});
