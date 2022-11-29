import React from 'react';

import { MaterialCommunityIcons } from '@expo/vector-icons';

const SmallButton = React.memo((props: any) => {
  return <MaterialCommunityIcons.Button size={16} borderRadius={50} iconStyle={{ marginRight: 0 }} {...props} />;
});

export default SmallButton;
