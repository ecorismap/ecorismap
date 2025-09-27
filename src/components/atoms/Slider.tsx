import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import RNSlider from '@react-native-community/slider';

interface Props {
  style?: { [key: string]: string | number };
  label: string;
  labelColor?: string;
  width?: number;
  initialValue: number;
  step: number;
  minimumValue: number;
  maximumValue: number;
  onSlidingComplete: (val: number) => void;
}

const Slider = React.memo((props: Props) => {
  const { style, label, width, initialValue, step, minimumValue, maximumValue, labelColor, onSlidingComplete } = props;
  const [sliderValue, setSliderValue] = useState(0);
  const [sliderWidth, setSliderWidth] = useState('99.99%');

  useEffect(() => {
    setSliderValue(initialValue);
    //web版のバグ？のため、このような処理を行う。
    setSliderWidth('60%');
  }, [initialValue, width]);

  return (
    <View
      style={[
        {
          alignItems: 'center',
          flexDirection: 'row',
          width: width,
        },
        style,
      ]}
    >
      <Text style={{ width: 80, fontSize: 13, color: labelColor }}>{label}</Text>
      <RNSlider
        // @ts-ignore
        style={{ height: 48, width: sliderWidth }}
        value={initialValue}
        step={step}
        minimumValue={minimumValue}
        maximumValue={maximumValue}
        onSlidingComplete={onSlidingComplete}
        onValueChange={setSliderValue}
      />
      <Text style={{ flex: 1 }}>{sliderValue?.toFixed(getDecimalDigitNumber(step))}</Text>
    </View>
  );
});

const getDecimalDigitNumber = (value: number) => {
  const decimalPointIndex = value.toString().indexOf('.');
  return decimalPointIndex < 1 ? 0 : value.toString().length - (decimalPointIndex + 1);
};

export default Slider;
