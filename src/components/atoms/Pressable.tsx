// src/components/MyPressable.tsx
import React from 'react';
import { Pressable as RNPressable, PressableProps as RNPressableProps, StyleProp, ViewStyle } from 'react-native';

export type PressableProps = RNPressableProps & {
  /**
   * 押下時のスタイルを個別指定したいときに上書き可能
   * デフォルトは opacity 0.6 です
   */
  pressedStyle?: StyleProp<ViewStyle>;
  /**
   * 押下時のアニメーションを無効化したい場合は true
   */
  disablePressedAnimation?: boolean;
};

const DEFAULT_PRESSED_STYLE: StyleProp<ViewStyle> = {
  opacity: 0.6,
};

export const Pressable: React.FC<PressableProps> = ({
  style,
  pressedStyle = DEFAULT_PRESSED_STYLE,
  children,
  disablePressedAnimation = false,
  ...rest
}) => (
  <RNPressable
    {...rest}
    style={({ pressed }) => {
      // If style is a function, resolve it with the current state
      const resolvedStyle = typeof style === 'function' ? style({ pressed }) : style;
      const resolvedPressedStyle = !disablePressedAnimation && pressed && pressedStyle ? pressedStyle : null;
      return [resolvedStyle, resolvedPressedStyle];
    }}
  >
    {children}
  </RNPressable>
);
