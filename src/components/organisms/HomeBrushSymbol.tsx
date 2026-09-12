import React from 'react';
import { Circle, Path, Polygon } from 'react-native-svg';

interface Props {
  strokeStyle: string;
  lineColor: string;
}

/**
 * ブラシ（行動範囲）の記号。20x20のviewBoxに描く前提で、線に沿って回転させて並べる。
 * 保存後の地図表示（HomeMapMemoBrush）と、確定前のプレビュー（HomeSvgView）で同じものを使う
 */
export const BrushSymbol = React.memo(({ strokeStyle, lineColor }: Props) => {
  switch (strokeStyle) {
    case 'PLUS':
      return <Path d="M5,10 L15,10" stroke={lineColor} strokeWidth="1.5" fill="none" />;
    case 'CROSS':
      return <Path d="M10,10 L20,10" stroke={lineColor} strokeWidth="1.5" fill="none" />;
    case 'SENKAI':
      return <Circle cx="15" cy="10" r="4" stroke={lineColor} strokeWidth="1.5" fill="none" />;
    case 'SENJYOU':
      return (
        <>
          <Circle cx="15" cy="10" r="4" stroke={lineColor} strokeWidth="1.5" fill="none" />
          <Circle cx="15" cy="10" r="2" stroke={lineColor} strokeWidth="1.5" fill="none" />
        </>
      );
    case 'KOUGEKI':
      return <Polygon points="10,4 20,10 10,16" stroke={lineColor} strokeWidth="0" fill={lineColor} />;
    case 'DISPLAY1':
      return <Path d="M4,19 L16,13 L4,7 L16,1" stroke={lineColor} strokeWidth="1.5" fill="none" />;
    case 'DISPLAY2':
      return <Path d="M16,19 L16,1" stroke={lineColor} strokeWidth="2" strokeDasharray={[10, 10]} fill="none" />;
    case 'KYUKOKA':
      return (
        <>
          {/* 上・中央・下のくさび型 */}
          <Path d="M5 7 L10 2 L15 7" stroke={lineColor} strokeWidth="1.5" fill="none" />
          <Path d="M5 12 L10 7 L15 12" stroke={lineColor} strokeWidth="1.5" fill="none" />
          <Path d="M5 17 L10 12 L15 17" stroke={lineColor} strokeWidth="1.5" fill="none" />
        </>
      );
    case 'TANJI':
      return (
        <>
          <Path d="M10 10 L4 4 V16 L10 10 Z" stroke={lineColor} strokeWidth="0" fill={lineColor} />
          <Path d="M10 10 L16 4 V16 L10 10 Z" stroke={lineColor} strokeWidth="0" fill={lineColor} />
        </>
      );
    case 'ESA':
      return <Circle cx="15" cy="10" r="2" stroke={lineColor} strokeWidth="1.5" fill={lineColor} />;
    case 'SUZAI':
      return <Path d="M10 10 H34" stroke={lineColor} strokeWidth="2" fill={lineColor} />;
    default:
      return null;
  }
});
