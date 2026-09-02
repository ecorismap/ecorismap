import React, { useCallback, useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { MeasureContext } from '../../contexts/Measure';
import { ViewshedContext } from '../../contexts/Viewshed';
import { ConfirmAsync } from '../molecules/AlertAsync';
import { t } from '../../i18n/config';

// 可視領域の表示中インジケータ兼消去UI（native/web共通）
export const HomeViewshedBanner = React.memo(() => {
  const { viewshedResults, hasViewshedPreview, clearViewshedResults } = useContext(ViewshedContext);
  const { isMeasuring } = useContext(MeasureContext);
  const insets = useSafeAreaInsets();

  const pressClear = useCallback(async () => {
    const ret = await ConfirmAsync(t('Home.confirm.discardViewshed'));
    if (ret) clearViewshedResults();
  }, [clearViewshedResults]);

  if (!hasViewshedPreview) return null;

  return (
    <View
      // 測定バナーと同時表示のときは重ならないよう下にずらす
      style={[styles.container, { top: insets.top + (isMeasuring ? 54 : 10) }]}
      pointerEvents="box-none"
    >
      <View style={styles.banner}>
        <MaterialCommunityIcons name="eye-outline" size={18} color={COLOR.WHITE} />
        <Text style={styles.text}>{t('Home.viewshed.previewCount', { count: viewshedResults.length })}</Text>
        <Pressable onPress={pressClear} style={styles.clearButton}>
          <MaterialCommunityIcons name="trash-can-outline" size={18} color={COLOR.WHITE} />
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: COLOR.BANNER_BACKGROUND,
    borderRadius: 20,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  clearButton: {
    marginLeft: 10,
  },
  container: {
    alignItems: 'center',
    elevation: 1001,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 1001,
  },
  text: {
    color: COLOR.WHITE,
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
});
