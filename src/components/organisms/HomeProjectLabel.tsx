import React from 'react';
import { Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../atoms/Pressable';

import { COLOR } from '../../constants/AppConstants';

interface Props {
  onPress: () => void;
  name: string;
}

const HomeProjectLabel = React.memo(function HomeProjectLabel(props: Props) {
  const { name, onPress } = props;
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      style={{
        alignSelf: 'center',
        position: 'absolute',
        top: insets.top + 10,
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
