import React, { useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { t } from '../../i18n/config';

//描画・マップメモツールバーの上に表示する編集レイヤボタン。タップでその場で切替できる。
//アイコンはレイヤ一覧の編集トグルと同じ見た目に揃え、レイヤ名は長押し（ホバー）のツールチップで確認できる
export const HomeEditingLayerButton = React.memo(() => {
  const { editingLayerName, pressEditingLayerButton } = useContext(DrawingToolsContext);
  const insets = useSafeAreaInsets();
  const noLayer = editingLayerName === undefined;

  const styles = StyleSheet.create({
    button: {
      alignSelf: 'flex-start',
      width: 40,
    },
    container: {
      left: 9 + insets.left,
      marginHorizontal: 0,
      position: 'absolute',
      top: insets.top + 296,
    },
  });

  return (
    <View style={styles.container}>
      <View style={styles.button}>
        <Button
          name={noLayer ? 'checkbox-blank-outline' : 'square-edit-outline'}
          backgroundColor={noLayer ? COLOR.ALFAORANGE : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={pressEditingLayerButton}
          labelText={t('Home.label.editingLayer')}
          labelFontSize={8}
          tooltipText={noLayer ? t('Home.label.noEditingLayer') : editingLayerName}
        />
      </View>
    </View>
  );
});
