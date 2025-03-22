import React, { useState, useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import CustomIcon, { isCustomIcon } from './CustomIcon';

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
  tooltipPosition?: any;
  labelText?: string;
  labelTextColor?: string;

  labelFontSize?: number;
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
    tooltipPosition,
    labelText,
    labelTextColor,
    labelFontSize,
  } = props;

  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeout = useRef<NodeJS.Timeout | null>(null);

  const handlePressIn = () => {
    const timeout = setTimeout(() => {
      setShowTooltip(true);
    }, 500); // 500ms の遅延を設定
    tooltipTimeout.current = timeout;
  };

  const handlePressOut = () => {
    if (tooltipTimeout) {
      clearTimeout(tooltipTimeout.current!);
      tooltipTimeout.current = null;
    }
    setShowTooltip(false);
  };

  const styles = StyleSheet.create({
    button: {
      alignItems: 'center',
      backgroundColor: backgroundColor || COLOR.BLUE,
      borderColor: borderColor || COLOR.BLACK,
      borderRadius: borderRadius || 50,
      borderWidth: borderWidth || 0,
      height: (40 * size) / 20,
      justifyContent: 'center',
      width: (40 * size) / 20,
    },
    label: {
      alignSelf: 'center',
      bottom: 4,
      color: labelTextColor || COLOR.WHITE,
      fontSize: labelFontSize || 10,
      fontWeight: 'bold',
      position: 'absolute',
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
      minWidth: (tooltipText?.length || 0) * 12,
    },
  });

  useEffect(() => {
    return () => {
      if (tooltipTimeout) {
        clearTimeout(tooltipTimeout.current!);
      }
    };
  }, []);

  const renderIcon = () => {
    const iconComponent = isCustomIcon(name) ? (
      <CustomIcon name={name} size={size} color={color} />
    ) : (
      <MaterialCommunityIcons name={name} size={size} color={color || COLOR.WHITE} />
    );

    return <View style={{ bottom: labelText ? 6 : 0 }}>{iconComponent}</View>;
  };
  return (
    <View style={{ alignItems: 'center' }}>
      {showTooltip && tooltipText && (
        <View style={[styles.tooltip, tooltipPosition]}>
          <Text style={styles.tooltipText}>{tooltipText}</Text>
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
        {renderIcon()}
        {<Text style={styles.label}>{labelText}</Text>}
      </Pressable>
    </View>
  );
});

export default Button;
