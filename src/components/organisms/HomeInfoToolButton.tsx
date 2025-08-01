import React, { useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { InfoToolContext } from '../../contexts/InfoTool';
import { useWindow } from '../../hooks/useWindow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../atoms';
import { COLOR, INFOTOOL } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { DrawingToolsContext } from '../../contexts/DrawingTools';

export const HomeInfoToolButton = React.memo(() => {
  const { isInfoToolActive, setVisibleInfoPicker, setInfoToolActive } = useContext(InfoToolContext);
  const { currentDrawTool } = useContext(DrawingToolsContext);
  const { isLandscape } = useWindow();
  const insets = useSafeAreaInsets();
  const disabled = currentDrawTool !== 'NONE';
  const styles = StyleSheet.create({
    buttonContainer: {
      // elevation: 101,
      left: 9 + insets.left,
      marginHorizontal: 0,
      position: 'absolute',
      top: insets.top + (isLandscape ? 230 : 240),
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
          backgroundColor={disabled ? COLOR.ALFAGRAY : isInfoToolActive ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          disabled={disabled}
          onPress={() => setInfoToolActive(!isInfoToolActive)}
          onLongPress={() => setVisibleInfoPicker(true)}
          labelText={t('Home.label.infoTool')}
        />
      </View>
    </View>
  );
});
