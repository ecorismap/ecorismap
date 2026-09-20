import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import CustomIcon, { isCustomIcon } from './CustomIcon';
import { Pressable } from './Pressable';

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
  labelNumberOfLines?: number;
  labelOnTop?: boolean; // 追加: trueの場合、ラベルをボタンの上に表示
  iconBackgroundColor?: string; // アイコンを台座（縁取り付きの丸）に載せる。色チップがボタン背景と紛れないようにする
}

//無効なボタンの中身（アイコン・ラベル）の濃さ。背景のグレーだけでは押せるように見えるため
const DISABLED_OPACITY = 0.45;

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
    labelNumberOfLines,
    labelOnTop,
    iconBackgroundColor,
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
      textAlign: 'center',
      width: '100%',
    },
    // ボタン上に表示するラベル用のスタイル（絶対配置を解除）
    labelOnTopStyle: {
      color: labelTextColor || COLOR.WHITE,
      fontSize: labelFontSize || 10,
      fontWeight: 'bold',
      marginBottom: 2,
    },
    disabledContent: {
      opacity: DISABLED_OPACITY,
    },
    iconBackdrop: {
      alignItems: 'center',
      backgroundColor: iconBackgroundColor,
      borderColor: COLOR.GRAY2,
      borderRadius: (size + 2) / 2,
      borderWidth: 1,
      height: size + 2,
      justifyContent: 'center',
      width: size + 2,
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
    //台座に載せるときは、台座＋余白がラベルと重ならないよう中身を少し小さくして1px上げる
    const iconSize = iconBackgroundColor ? size - 4 : size;
    const icon = isCustomIcon(name) ? (
      <CustomIcon name={name} size={iconSize} color={color} />
    ) : (
      <MaterialCommunityIcons name={name} size={iconSize} color={color || COLOR.WHITE} selectable={undefined} />
    );
    return (
      //無効なボタンは中身を薄くする。背景色だけだと「押せる操作」に見えてしまう
      <View style={{ bottom: labelText ? (iconBackgroundColor ? 7 : 6) : 0, opacity: disabled ? DISABLED_OPACITY : 1 }}>
        {iconBackgroundColor ? <View style={styles.iconBackdrop}>{icon}</View> : icon}
      </View>
    );
  };

  return (
    // zIndexはツールチップを他の要素より前に出すためのもの。常に持たせると、
    // リストのスティッキーヘッダーより手前にボタンが描かれて重なって見える
    <View style={{ alignItems: 'center', zIndex: showTooltip ? 10000 : undefined }}>
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
        {labelText && labelOnTop && (
          <Text style={[styles.labelOnTopStyle, disabled && styles.disabledContent]}>{labelText}</Text>
        )}
        {renderIcon()}
        {labelText && !labelOnTop && (
          <Text style={[styles.label, disabled && styles.disabledContent]} numberOfLines={labelNumberOfLines}>
            {labelText}
          </Text>
        )}
      </Pressable>
    </View>
  );
});

export default Button;
