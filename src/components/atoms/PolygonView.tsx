import React from 'react';
import { View } from 'react-native';

const PolygonView = React.memo((props: any) => {
  const { style, color } = props;
  return (
    <View
      style={[
        {
          alignItems: 'center',
          width: 18,
          height: 18,
          borderWidth: 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
});

export default PolygonView;
