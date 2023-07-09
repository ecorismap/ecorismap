import React from 'react';
import { Text, Platform, TouchableOpacity } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { useScreen } from '../../hooks/useScreen';
import { useWindow } from '../../hooks/useWindow';

interface Props {
  onPress: () => void;
  name: string;
}

export default function HomeProjectLabel(props: Props) {
  const { name, onPress } = props;
  const { screenState } = useScreen();
  const { isLandscape } = useWindow();
  return (
    <TouchableOpacity
      style={{
        alignSelf: 'center',
        position: 'absolute',
        top: Platform.OS === 'ios' && screenState === 'closed' && !isLandscape ? 40 : 10,
        padding: 5,
        backgroundColor: COLOR.ALFAWHITE,
        borderRadius: 5,
        borderColor: COLOR.GRAY2,
        borderWidth: 1,
        zIndex: 100,
      }}
      onPress={onPress}
    >
      <Text>{name}</Text>
    </TouchableOpacity>
  );
}
