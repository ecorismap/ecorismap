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
//交尾の★。外接円の半径7・内側2.67の五芒星を、外接矩形の中心が(10,10)に来るよう下げたもの
export const KOUBI_STAR_POINTS =
  '10.00,3.67 11.57,8.51 16.66,8.51 12.54,11.49 14.11,16.33 10.00,13.34 5.89,16.33 7.46,11.49 3.34,8.51 8.43,8.51';

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
      //★は文字ではなく多角形で描く。文字はベースライン基準なので中心が記録位置から上へずれ、
      //さらに端末のフォントで形も大きさも変わる。座標は外接矩形の中心を(10,10)に合わせたもの
      //（星は上の頂点が下辺より遠いため、外接円の中心で合わせると上寄りに見える）
      return <Polygon points={KOUBI_STAR_POINTS} stroke={lineColor} strokeWidth="0" fill={lineColor} />;
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
