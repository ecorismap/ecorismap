import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Button } from '../atoms';
import { HOME_BTN, COLOR } from '../../constants/AppConstants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  azimuth: number;
  headingUp: boolean;
  // 方角線（現在地から伸びる方位の線）が表示中かどうか。長押しで切り替える
  showDirectionLine: boolean;
  onPressCompass: () => void;
  onLongPressCompass: () => void;
}

const areEqual = (prevProps: Props, nextProps: Props) => {
  // Compare azimuth with a tolerance of 3 degrees
  if (Math.abs(prevProps.azimuth - nextProps.azimuth) > 3) return false;
  if (prevProps.headingUp !== nextProps.headingUp) return false;
  if (prevProps.showDirectionLine !== nextProps.showDirectionLine) return false;
  if (prevProps.onPressCompass !== nextProps.onPressCompass) return false;
  if (prevProps.onLongPressCompass !== nextProps.onLongPressCompass) return false;
  return true;
};

export const HomeCompassButton = React.memo((props: Props) => {
  //console.log('render Compass');
  const { azimuth, headingUp, showDirectionLine, onPressCompass, onLongPressCompass } = props;
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
        // 方角線ON時は背景色で状態を示す（長押しで切り替わることに気づけるようにする）
        backgroundColor={showDirectionLine ? COLOR.ALFAORANGE : COLOR.ALFAWHITE}
        borderColor={COLOR.GRAY4}
        borderWidth={1}
        //size={18}
        onPress={onPressCompass}
        onLongPress={onLongPressCompass}
        labelText="N"
        labelTextColor={COLOR.BLACK}
        labelOnTop={true}
      />
    </View>
  );
}, areEqual);
