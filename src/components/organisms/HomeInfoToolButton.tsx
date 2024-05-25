import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { HomeContext } from '../../contexts/Home';
import { useWindow } from '../../hooks/useWindow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../atoms';
import { COLOR, INFOTOOL } from '../../constants/AppConstants';
import { t } from '../../i18n/config';

export const HomeInfoToolButton = () => {
  const { isEditingDraw, isSelectedDraw, currentInfoTool, selectInfoTool, setVisibleInfoPicker } =
    useContext(HomeContext);
  const { isLandscape } = useWindow();
  const insets = useSafeAreaInsets();
  const disabled = isEditingDraw || isSelectedDraw;
  const styles = StyleSheet.create({
    buttonContainer: {
      // elevation: 101,
      left: 9 + insets.left,
      marginHorizontal: 0,
      position: 'absolute',
      top: Platform.OS === 'ios' && !isLandscape ? 260 : 240,
      // zIndex: 101,
    },

    selectionalButton: {
      alignSelf: 'flex-start',
      marginTop: 2,
    },
  });
  return (
    <View style={styles.buttonContainer}>
      <View style={styles.selectionalButton}>
        <Button
          name={INFOTOOL.ALL_INFO}
          backgroundColor={disabled ? COLOR.ALFAGRAY : currentInfoTool === 'NONE' ? COLOR.ALFABLUE : COLOR.ALFARED}
          borderRadius={10}
          disabled={disabled}
          onPress={() => setVisibleInfoPicker(true)}
          onLongPress={() => selectInfoTool('NONE')}
          tooltipText={t('common.InfoTool')}
          tooltipPosition={{ left: 1 }}
        />
      </View>
    </View>
  );
};
