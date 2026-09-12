import React, { useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { ProjectContext } from '../../contexts/Project';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';

//プロジェクトラベルの下に表示する編集レイヤ名のラベル兼ボタン。タップでその場で切替できる
export const HomeEditingLayerButton = React.memo(() => {
  const { editingLayerName, pressEditingLayerButton } = useContext(DrawingToolsContext);
  const { projectName } = useContext(ProjectContext);
  const insets = useSafeAreaInsets();
  //プロジェクトラベル非表示時はその位置（top+10）まで詰める
  const hasProjectLabel = projectName !== undefined;
  const { windowWidth } = useWindow();
  const noLayer = editingLayerName === undefined;

  const styles = StyleSheet.create({
    chip: {
      alignItems: 'center',
      backgroundColor: COLOR.ALFAORANGE,
      borderRadius: 16,
      elevation: 101,
      flexDirection: 'row',
      height: 32,
      paddingHorizontal: 10,
      shadowColor: COLOR.BLACK,
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
    },
    //プロジェクトラベル（top+10、高さ約35）の下。ラベル非表示時はラベル位置まで上げる
    container: {
      alignItems: 'center',
      alignSelf: 'center',
      flexDirection: 'row',
      justifyContent: 'center',
      position: 'absolute',
      top: insets.top + (hasProjectLabel ? 45 : 10),
    },
    text: {
      color: COLOR.WHITE,
      fontSize: 13,
      fontWeight: 'bold',
      marginHorizontal: 4,
      maxWidth: windowWidth * 0.45,
    },
  });

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Pressable style={styles.chip} onPress={pressEditingLayerButton}>
        <MaterialCommunityIcons name="square-edit-outline" size={16} color={COLOR.WHITE} />
        <Text style={styles.text} numberOfLines={1}>
          {noLayer ? t('Home.label.noEditingLayer') : editingLayerName}
        </Text>
        <MaterialCommunityIcons name="chevron-down" size={16} color={COLOR.WHITE} />
      </Pressable>
    </View>
  );
});
