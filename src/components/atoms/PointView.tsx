import React from 'react';
import { View } from 'react-native';

const PointView = React.memo((props: any) => {
  //console.log('render PointView');
  const { style, size, color, borderColor } = props;

  return (
    <View
      style={[
        {
          alignItems: 'center',
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: color,
          borderColor: borderColor,
          borderWidth: 1,
        },
        style,
      ]}
    />
  );
});

export default PointView;
