import React from 'react';
import { Platform, View } from 'react-native';
import { Button } from '../atoms';
import { HOME_BTN, COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { useScreen } from '../../hooks/useScreen';

interface Props {
  magnetometer: any;
  headingUp: boolean;
  onPressCompass: () => void;
}

export const HomeCompassButton = React.memo((props: Props) => {
  //console.log('render Compass');
  const { magnetometer, headingUp, onPressCompass } = props;
  const { isLandscape } = useWindow();
  const { screenState } = useScreen();

  return (
    <View
      style={{
        marginHorizontal: 0,
        left: 9,
        position: 'absolute',
        top: Platform.OS === 'ios' && !isLandscape && screenState !== 'opened' ? 40 : 20,
        transform: [{ rotate: `${!magnetometer || !headingUp ? 0 : 360 - magnetometer!.trueHeading}deg` }],
        zIndex: 101,
        elevation: 101,
      }}
    >
      <Button
        name={HOME_BTN.COMPASS}
        color={COLOR.BLACK}
        backgroundColor={COLOR.ALFAWHITE}
        borderColor={COLOR.GRAY4}
        borderWidth={1}
        //size={18}
        onPress={onPressCompass}
      />
    </View>
  );
});
