import React from 'react';
import { View } from 'react-native';

import { COLOR } from '../../constants/AppConstants';

const LineView = React.memo((props: any) => {
  const { style, color } = props;
  return (
    <View
      style={[
        {
          alignItems: 'center',
          width: 18,
          height: 4,
          backgroundColor: COLOR.WHITE,
          borderWidth: 2,
          borderColor: color,
        },
        style,
      ]}
    />
  );
});

export default LineView;
