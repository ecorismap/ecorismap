import React from 'react';
import { Platform, View } from 'react-native';
import { Button } from '../atoms';
import { HOME_BTN, COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';

interface Props {
  gpsState: any;
  onPressGPS: () => void;
}

export const HomeGPSButton = React.memo((props: Props) => {
  //console.log('render Compass');
  const { gpsState, onPressGPS } = props;
  const { isLandscape } = useWindow();

  return (
    <View
      style={{
        marginHorizontal: 0,
        left: 9,
        position: 'absolute',
        top: Platform.OS === 'ios' && !isLandscape ? 207 : 180,
        // zIndex: 101,
        // elevation: 101,
      }}
    >
      <Button
        name={HOME_BTN.GPS}
        backgroundColor={gpsState === 'follow' ? 'red' : gpsState === 'show' ? COLOR.PALERED : COLOR.ALFABLUE}
        onPress={() => onPressGPS()}
      />
    </View>
  );
});
