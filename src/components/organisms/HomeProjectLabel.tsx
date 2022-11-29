import React from 'react';
import { Text, Platform, TouchableOpacity } from 'react-native';

import { COLOR } from '../../constants/AppConstants';

interface Props {
  onPress: () => void;
  name: string;
}

export default function HomeProjectLabel(props: Props) {
  const { name, onPress } = props;

  return (
    <TouchableOpacity
      style={{
        alignSelf: 'center',
        position: 'absolute',
        top: Platform.OS === 'ios' ? 40 : 10,
        padding: 5,
        backgroundColor: COLOR.ALFAWHITE,
        borderRadius: 5,
        borderColor: COLOR.GRAY2,
        borderWidth: 1,
      }}
      onPress={onPress}
    >
      <Text>{name}</Text>
    </TouchableOpacity>
  );
}
