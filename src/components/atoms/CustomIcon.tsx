import React from 'react';
import { Svg, Path } from 'react-native-svg';

interface CustomIconProps {
  name: string;
  size: number;
  color?: string;
}

// カスタムアイコンを管理するオブジェクト
const ICON_MAP: Record<string, (size: number, color?: string) => JSX.Element> = {
  'kougeki-custom': (size, color) => (
    <Svg width={size} height={size} viewBox="0 0 180 320" fill="none">
      <Path d="M80 0V180M80 180V320" stroke={color || 'white'} strokeWidth="20" />
      {/* 上側の反転した三角形 */}
      <Path d="M180 80L80 30V130L180 80Z" fill={color || 'white'} strokeWidth="40" />
      {/* 下側の反転した三角形 */}
      <Path d="M180 240L80 190V290L180 240Z" fill={color || 'white'} strokeWidth="40" />
    </Svg>
  ),
  'display-custom': (size, color) => (
    <Svg width={size} height={size} viewBox="0 0 160 320" fill="none">
      <Path d="M80 0V160M80 160V320" stroke={color || 'white'} strokeWidth="30" />
      <Path d="M0 60 L160 120 L10 160 L160 220 L10 260" stroke={color || 'white'} strokeWidth="20" />
    </Svg>
  ),
  'kyukoka-custom': (size, color) => (
    <Svg width={size} height={size} viewBox="0 0 160 320" fill="none">
      <Path d="M80 0V160M80 160V320" stroke={color || 'white'} strokeWidth="30" />
      <Path d="M0 120 L80 60 L160 120" stroke={color || 'white'} strokeWidth="30" />
      <Path d="M0 180 L80 120 L160 180" stroke={color || 'white'} strokeWidth="30" />
      <Path d="M0 240 L80 180 L160 240" stroke={color || 'white'} strokeWidth="30" />
    </Svg>
  ),
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
