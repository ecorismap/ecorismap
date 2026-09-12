import React from 'react';
import { Circle, Line, Polygon, Rect, Text } from 'react-native-svg';

interface Props {
  stamp: string;
  lineColor: string;
}

/**
 * スタンプ（行動位置など）の記号。20x20のviewBoxに描く前提。
 * 保存後の地図表示（HomeMapMemoStamp）と、確定前のプレビュー（HomeSvgView）で同じものを使い、
 * 確定の前後で大きさ・形が変わらないようにする。
 * 数字・英字・文字はレコードのラベルを描くため、ここでは扱わない
 */
export const StampSymbol = React.memo(({ stamp, lineColor }: Props) => {
  switch (stamp) {
    case 'TOMARI':
      return <Circle cx="10" cy="10" r="4" stroke="#ffffffaa" strokeWidth="1" fill={lineColor} />;
    case 'KARI':
      return (
        <>
          <Circle cx="10" cy="10" r="7" stroke={lineColor} strokeWidth="1" fill="#ffffffaa" />
          <Line x1="5" y1="5" x2="15" y2="15" stroke={lineColor} strokeWidth="1.5" />
          <Line x1="15" y1="5" x2="5" y2="15" stroke={lineColor} strokeWidth="1.5" />
        </>
      );
    case 'HOVERING':
      return (
        <>
          <Circle cx="10" cy="10" r="7" stroke={lineColor} strokeWidth="1" fill="#ffffffaa" />
          <Text x="10" y="14" fontSize="11" fontWeight="bold" fill={lineColor} textAnchor="middle">
            H
          </Text>
        </>
      );
    case 'VOICE':
      return (
        <>
          <Circle cx="10" cy="10" r="8" stroke={lineColor} strokeWidth="1" fill="#ffffffaa" />
          <Text x="10" y="15" fontSize="11" fontWeight="bold" fill={lineColor} textAnchor="middle">
            Vo
          </Text>
        </>
      );
    case 'KOUBI':
      return (
        <Text x="9" y="14" fontSize="18" fontWeight="bold" fill={lineColor} textAnchor="middle">
          ★
        </Text>
      );
    case 'SQUARE':
      return <Rect x="4" y="4" width="12" height="12" stroke={lineColor} strokeWidth="2" fill={lineColor} />;
    case 'CIRCLE':
      return <Circle cx="10" cy="10" r="6" stroke={lineColor} strokeWidth="3" fill={lineColor} />;
    case 'TRIANGLE':
      return <Polygon points="10,3.68 2,18 18,18" stroke={lineColor} strokeWidth="0" fill={lineColor} />;
    default:
      return null;
  }
});

//このコンポーネントが扱う記号か（数字・英字・文字はラベルを描くため別扱い）
export const hasStampSymbol = (stamp: string) =>
  ['TOMARI', 'KARI', 'HOVERING', 'VOICE', 'KOUBI', 'SQUARE', 'CIRCLE', 'TRIANGLE'].includes(stamp);
