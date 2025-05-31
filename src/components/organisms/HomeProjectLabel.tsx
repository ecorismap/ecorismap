import React from 'react';
import { Text, Platform } from 'react-native';
import { Pressable } from '../atoms/Pressable';

import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';

interface Props {
  onPress: () => void;
  name: string;
}

const HomeProjectLabel = React.memo(function HomeProjectLabel(props: Props) {
  const { name, onPress } = props;
  const { isLandscape } = useWindow();
  return (
    <Pressable
      style={{
        alignSelf: 'center',
        position: 'absolute',
        top: Platform.OS === 'ios' && !isLandscape ? 55 : 20,
        padding: 5,
        backgroundColor: COLOR.ALFAWHITE,
        borderRadius: 5,
        borderColor: COLOR.GRAY2,
        borderWidth: 1,
        zIndex: 1,
      }}
      onPress={onPress}
    >
      <Text>{name}</Text>
    </Pressable>
  );
});

export default HomeProjectLabel;
