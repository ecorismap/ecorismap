import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';

const Button = React.memo((props: any) => {
  const { onPress, name, size = 20, borderRadius, color, backgroundColor, style, tooltipText } = props;
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
      borderRadius: borderRadius || 50,
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
      <Pressable onPress={onPress} onHoverIn={handlePressIn} onHoverOut={handlePressOut} style={[styles.button, style]}>
        <MaterialCommunityIcons name={name} size={size} color={color || COLOR.WHITE} />
      </Pressable>
    </View>
  );
});

export default Button;
