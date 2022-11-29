import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { COLOR } from '../../constants/AppConstants';

const RectButton = React.memo((props: any) => {
  return (
    <MaterialCommunityIcons.Button
      style={{ backgroundColor: COLOR.GRAY3 }}
      size={20}
      borderRadius={10}
      iconStyle={{ marginRight: 0 }}
      {...props}
    />
  );
});

export default RectButton;
