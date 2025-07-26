import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Button } from '../atoms';
import { HOME_BTN, COLOR } from '../../constants/AppConstants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  azimuth: number;
  headingUp: boolean;
  onPressCompass: () => void;
}

const areEqual = (prevProps: Props, nextProps: Props) => {
  // Compare azimuth with a tolerance of 3 degrees
  const azimuthChanged = Math.abs(prevProps.azimuth - nextProps.azimuth) > 3;
  const headingUpChanged = prevProps.headingUp !== nextProps.headingUp;
  return !azimuthChanged && !headingUpChanged;
};

export const HomeCompassButton = React.memo((props: Props) => {
  //console.log('render Compass');
  const { azimuth, headingUp, onPressCompass } = props;
  const insets = useSafeAreaInsets();
  const compassAngle = useMemo(() => {
    return headingUp ? 360 - azimuth : 0;
  }, [azimuth, headingUp]);

  //console.log(headingUp, magnetometer);
  return (
    <View
      style={{
        marginHorizontal: 0,
        left: 9 + insets.left,
        position: 'absolute',
        top: insets.top + 10,
        transform: [{ rotate: `${compassAngle}deg` }],
        // zIndex: 101,
        // elevation: 101,
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
        labelText="N"
        labelTextColor={COLOR.BLACK}
        labelOnTop={true}
      />
    </View>
  );
}, areEqual);
