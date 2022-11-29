import React from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const Button = React.memo((props: any) => {
  //console.log(props);
  return <MaterialCommunityIcons.Button borderRadius={50} iconStyle={{ marginRight: 0 }} size={20} {...props} />;
});
export default Button;
