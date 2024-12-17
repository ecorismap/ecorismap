import React from 'react';
import { Svg, Path } from 'react-native-svg';

interface CustomIconProps {
  name: string;
  size: number;
  color?: string;
}

// カスタムアイコンを管理するオブジェクト
const ICON_MAP: Record<string, (size: number, color?: string) => JSX.Element> = {
  'tanji-custom': (size, color) => (
    <Svg width={size} height={size} viewBox="0 0 160 320" fill="none">
      <Path d="M80 0V160M80 160V320" stroke={color || 'white'} strokeWidth="12" />
      <Path d="M80 80L0 10V150L80 80Z" fill={color || 'white'} />
      <Path d="M80 80L160 10V150L80 80Z" fill={color || 'white'} />
      <Path d="M80 240L0 170V310L80 240Z" fill={color || 'white'} />
      <Path d="M80 240L160 170V310L80 240Z" fill={color || 'white'} />
    </Svg>
  ),
};

// カスタムアイコンが存在するかを判別する関数
export const isCustomIcon = (name: string): boolean => {
  return Object.prototype.hasOwnProperty.call(ICON_MAP, name);
};

const CustomIcon: React.FC<CustomIconProps> = ({ name, size, color }) => {
  const IconComponent = ICON_MAP[name];
  return IconComponent ? IconComponent(size, color) : null;
};

export default CustomIcon;
