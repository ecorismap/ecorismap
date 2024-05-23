import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  id?: string;
  disabled?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  onPressCustom?: () => void;
  name: any;
  size?: number;
  borderRadius?: number;
  color?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: number;
  style?: any;
  tooltipText?: string;
}

const Button = React.memo((props: Props) => {
  const {
    disabled,
    onPress,
    onLongPress,
    name,
    size = 20,
    borderRadius,
    color,
    backgroundColor,
    borderColor,
    borderWidth,
    style,
    tooltipText,
  } = props;
  const [showTooltip, setShowTooltip] = useState(false);

  const handlePressIn = () => {
    setShowTooltip(true);
  };

  const handlePressOut = () => {
    setShowTooltip(false);
  };

  const styles = StyleSheet.create({
    button: {
      alignItems: 'center',
      backgroundColor: backgroundColor || COLOR.BLUE,
      borderColor: borderColor || COLOR.BLACK,
      borderRadius: borderRadius || 50,
      borderWidth: borderWidth || 0,
      height: 35,
      justifyContent: 'center',
      width: 35,
    },
    tooltip: {
      backgroundColor: COLOR.BLACK,
      borderRadius: 5,
      bottom: 45,
      padding: 5,
      position: 'absolute',
      zIndex: 1,
    },
    tooltipText: {
      color: COLOR.WHITE,
      fontSize: 12,
    },
  });

  return (
    <View style={{ alignItems: 'center' }}>
      {showTooltip && (
        <View style={styles.tooltip}>
          <Text style={styles.tooltipText}>{tooltipText || 'Tooltip'}</Text>
        </View>
      )}
      <Pressable
        disabled={disabled}
        onPress={onPress}
        onLongPress={onLongPress}
        onHoverIn={handlePressIn}
        onHoverOut={handlePressOut}
        style={[styles.button, style]}
      >
        <MaterialCommunityIcons name={name} size={size} color={color || COLOR.WHITE} />
      </Pressable>
    </View>
  );
});

export default Button;
