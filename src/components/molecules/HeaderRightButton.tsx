import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Button } from '../atoms';

interface Props {
  name: string;
  onPress: () => void;
  backgroundColor?: string;
  disabled?: boolean;
  testID?: string;
  borderRadius?: number;
  size?: number;
  color?: string;
}

const HeaderRightButton = React.memo((props: Props) => {
  const { name, onPress, backgroundColor, disabled, borderRadius, size, color } = props;

  return (
    <View style={styles.headerRight}>
      <Button
        name={name}
        onPress={onPress}
        backgroundColor={backgroundColor}
        disabled={disabled}
        borderRadius={borderRadius ?? 50}
        size={size ?? 21}
        color={color}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  headerRight: {
    justifyContent: 'flex-end',
    marginBottom: Platform.OS === 'ios' ? 5 : 0,
    marginLeft: Platform.OS === 'web' ? 0 : 15,
    marginRight: Platform.OS === 'web' ? 10 : -5,
  },
});

export default HeaderRightButton;
