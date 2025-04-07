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
  labelOnTop?: boolean; // 追加: trueの場合、ラベルをボタンの上に表示
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
    labelOnTop,
  } = props;

  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipTimeout = useRef<NodeJS.Timeout | null>(null);

  const handlePressIn = () => {
    const timeout = setTimeout(() => {
      setShowTooltip(true);
    }, 500); // 500ms の遅延
    tooltipTimeout.current = timeout;
  };

  const handlePressOut = () => {
    if (tooltipTimeout.current) {
      clearTimeout(tooltipTimeout.current);
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
    // ボタン内部に表示するラベル用のスタイル
    label: {
      alignSelf: 'center',
      bottom: 4,
      color: labelTextColor || COLOR.WHITE,
      fontSize: labelFontSize || 10,
      fontWeight: 'bold',
      position: 'absolute',
    },
    // ボタン上に表示するラベル用のスタイル（絶対配置を解除）
    labelOnTopStyle: {
      color: labelTextColor || COLOR.WHITE,
      fontSize: labelFontSize || 10,
      fontWeight: 'bold',
      marginBottom: 2,
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
      if (tooltipTimeout.current) {
        clearTimeout(tooltipTimeout.current);
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
        {labelText && labelOnTop && <Text style={styles.labelOnTopStyle}>{labelText}</Text>}
        {renderIcon()}
        {labelText && !labelOnTop && <Text style={styles.label}>{labelText}</Text>}
      </Pressable>
    </View>
  );
});

export default Button;
