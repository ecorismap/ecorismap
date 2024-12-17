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
      height: (35 * size) / 20,
      justifyContent: 'center',
      width: (35 * size) / 20,
    },
    tooltip: {
      backgroundColor: COLOR.BLACK,
      borderRadius: 5,
      bottom: 45,
      padding: 5,
      position: 'absolute',
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
    if (isCustomIcon(name)) {
      return <CustomIcon name={name} size={size} color={color} />;
    } else {
      return <MaterialCommunityIcons name={name} size={size} color={color || COLOR.WHITE} />;
    }
  };
  return (
    <View style={{ alignItems: 'center', zIndex: 10000 }}>
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
      </Pressable>
    </View>
  );
});

export default Button;
