import React from 'react';
import { View } from 'react-native';
import { Button } from '../atoms';
import { HOME_BTN, COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from 'i18next';
interface Props {
  gpsState: any;
  onPressGPS: () => void;
}

export const HomeGPSButton = React.memo((props: Props) => {
  //console.log('render Compass');
  const { gpsState, onPressGPS } = props;
  const { isLandscape } = useWindow();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        marginHorizontal: 0,
        left: 9 + insets.left,
        position: 'absolute',
        top: insets.top + (isLandscape ? 170 : 187),
        // zIndex: 101,
        // elevation: 101,
      }}
    >
      <Button
        name={HOME_BTN.GPS}
        backgroundColor={gpsState === 'follow' ? 'red' : gpsState === 'show' ? COLOR.PALERED : COLOR.ALFABLUE}
        onPress={() => onPressGPS()}
        labelText={t('Home.label.gps')}
      />
    </View>
  );
});
