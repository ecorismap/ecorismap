import React from 'react';
import { Text } from 'react-native';

interface Props {
  label: string;
  size: number;
  color: string;
  borderColor: string;
}
const PointLabel = React.memo((props: Props) => {
  //console.log('render PointLabel');
  const { label, size, color, borderColor } = props;
  //console.log(label);
  return (
    <Text
      style={{
        fontSize: size,
        color: color,
        textShadowOffset: {
          width: 1,
          height: 1,
        },
        textShadowRadius: 1,
        textShadowColor: borderColor,
      }}
    >
      {label}
    </Text>
  );
});

export default PointLabel;
