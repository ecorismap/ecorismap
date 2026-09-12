import React, { useContext, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { Picker } from '../atoms';
import { t } from '../../i18n/config';
import { LayerEditContext } from '../../contexts/LayerEdit';
import { ToolPaletteType } from '../../types';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';

/**
 * レイヤの用途（飛翔図・植生図）。
 * 用途を決めると、そのタブでツールパレット（設定を焼き込んだボタン）が出て、
 * 色分けに「個別（ストロークごとの色）」を選べるようになる。
 * ラインは飛翔図、ポリゴンは植生図のみ。飛翔図は組織アカウント限定
 */
export const LayerEditToolPalette = () => {
  const { layer, onChangeToolPalette } = useContext(LayerEditContext);
  const { hisyouTool } = useFeatureFlags();

  const options = useMemo(() => {
    const items: { value: string; label: string }[] = [{ value: 'NONE', label: t('common.none') }];
    if (layer.type === 'LINE' && hisyouTool) items.push({ value: 'HISYOU', label: t('common.hisyouMap') });
    if (layer.type === 'POLYGON') items.push({ value: 'VEGETATION', label: t('common.vegetationMap') });
    return items;
  }, [hisyouTool, layer.type]);

  //選べる用途が無いレイヤ（ポイント等、飛翔図が使えないアカウントのライン）では出さない
  if (options.length < 2) return null;

  return (
    <View style={styles.tr}>
      <View style={styles.td}>
        <Picker
          label={t('common.purpose')}
          selectedValue={layer.toolPalette ?? 'NONE'}
          onValueChange={(itemValue) =>
            onChangeToolPalette(itemValue === 'NONE' ? undefined : (itemValue as ToolPaletteType))
          }
          itemLabelArray={options.map((o) => o.label)}
          itemValueArray={options.map((o) => o.value)}
          maxIndex={options.length - 1}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flex: 1,
    flexDirection: 'row',
    height: 60,
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
  tr: {
    flexDirection: 'row',
    height: 60,
  },
});
