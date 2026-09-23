import React from 'react';
import { View } from 'react-native';
import { t } from 'i18next';
import { Button } from '../atoms';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  top: number;
  left: number;
  isTerrainActive: boolean;
  toggleTerrain: () => void;
}

/**
 * 3D表示の切り替えボタン（ネイティブ）。
 * 地図左側のGPSボタンと同じ丸ボタンに揃える。Webはmaplibreの標準コントロールに
 * 並べるため、白い角丸の別デザイン（HomeTerrainControl.web.tsx）を使う
 */
export const HomeTerrainControl = React.memo((props: Props) => {
  const { top, left, isTerrainActive, toggleTerrain } = props;

  return (
    <View style={{ left, position: 'absolute', top }}>
      <Button
        name="terrain"
        // 有効中は半透明のまま色相を変えて状態を示す（濃淡だけでは見分けにくい）。
        // 赤系はGPSの表示・追従状態で使っているのでオレンジにする
        backgroundColor={isTerrainActive ? COLOR.ALFAORANGE : COLOR.ALFABLUE}
        // 引数なしで呼ぶ（toggleTerrainは引数を「有効にするか」と解釈するため、イベントを渡さない）
        onPress={() => toggleTerrain()}
        labelText={t('Home.label.terrain3d')}
      />
    </View>
  );
});
