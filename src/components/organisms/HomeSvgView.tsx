import React, { useContext } from 'react';
import { Platform, View } from 'react-native';

import Svg, { G, Path, Circle } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { ulid } from 'ulid';
import { COLOR } from '../../constants/AppConstants';
import { isFreehandTool, isPlotTool, isPolygonTool } from '../../utils/General';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { SVGDrawingContext } from '../../contexts/SVGDrawing';

// 頂点マーカーは markerStart/markerMid/markerEnd（ネイティブMarker定義）を使わず、
// 各頂点に図形を直接描画する。理由:
//  ・iOS(react-native-svg 15): Svg新規マウント時に <Defs> の <Marker> 登録がpath描画に
//    間に合わず markerStart/markerMid が描画されない（地図移動後の再表示で連結点が消える）
//  ・Android: markerUnits のスケール解釈がiOS/Webと異なりマーカーが大きくなる
// 明示描画なら全プラットフォームでサイズ・挙動が一致する。
// サイズは従来のmarkerWidth=12・viewBox=10（1単位≒2.4px）相当に合わせている。
const renderVertexMarker = (markerUrl: string, x: number, y: number, key: string) => {
  switch (markerUrl) {
    case 'url(#firstPoint)':
    case 'url(#plot)':
      return <Circle key={key} cx={x} cy={y} r={8.4} fill={COLOR.BLUE} stroke="white" strokeWidth={3.6} />;
    case 'url(#point)':
      return <Circle key={key} cx={x} cy={y} r={7.2} fill="yellow" stroke="black" strokeWidth={2.4} />;
    case 'url(#add)':
      return (
        <G key={key}>
          <Circle cx={x} cy={y} r={12} fill={COLOR.ALFABLUE} stroke="blue" strokeWidth={2.4} />
          <Path stroke={COLOR.WHITE} strokeWidth={3.6} d={`M ${x - 7.2} ${y} L ${x + 7.2} ${y}`} />
          <Path stroke={COLOR.WHITE} strokeWidth={3.6} d={`M ${x} ${y - 7.2} L ${x} ${y + 7.2}`} />
        </G>
      );
    case 'url(#delete)':
      return (
        <G key={key}>
          <Circle cx={x} cy={y} r={12} fill="grey" stroke="darkgrey" strokeWidth={2.4} />
          <Path stroke={COLOR.WHITE} strokeWidth={3.6} d={`M ${x - 7.2} ${y - 7.2} L ${x + 7.2} ${y + 7.2}`} />
          <Path stroke={COLOR.WHITE} strokeWidth={3.6} d={`M ${x - 7.2} ${y + 7.2} L ${x + 7.2} ${y - 7.2}`} />
        </G>
      );
    default:
      return null;
  }
};

// ライン/ポリゴンの各頂点に明示的なマーカー図形を描画する。
// SVGのmarkerStart/markerMid/markerEndと同じ配置（始点=start, 中間=mid, 終点=end）。
const renderVertexMarkers = (
  xy: [number, number][],
  startStyle: string,
  midStyle: string,
  endStyle: string,
  idx: number
) => {
  return xy.map((p, i) => {
    const style = i === 0 ? startStyle : i === xy.length - 1 ? endStyle : midStyle;
    if (!style) return null;
    return renderVertexMarker(style, p[0], p[1], `m${idx}-${i}`);
  });
};

export const SvgView = React.memo(() => {
  const { currentDrawTool, isEditingObject } = useContext(DrawingToolsContext);
  const { drawLine, editingLine, selectLine } = useContext(SVGDrawingContext);

  // New Architecture（Fabric）のiOSでは、同じSvgインスタンス内の子要素をRef駆動（drawLine.current）で
  // 更新しても再描画されないため、内容が変わる境界でSvgを再マウントして反映させる。
  // ・プロット系（ポイント/ライン/ポリゴン）と編集中: 全ノードの座標をシグネチャに含め、点の追加・
  //   位置移動・削除のいずれにも追従する
  // ・フリーハンド: 1ストロークで点が連続追加されるため、座標シグネチャだと毎フレーム再マウントになり
  //   重く・ちらつくので、描画対象の有無（空↔非空）の境界でのみ再マウントする
  const iosRemountKey =
    Platform.OS !== 'ios'
      ? undefined
      : isFreehandTool(currentDrawTool)
      ? drawLine.current.length === 0
        ? 'svg-empty'
        : 'svg-draw'
      : drawLine.current
          .map((line) => line.xy.map((p) => `${Math.round(p[0])},${Math.round(p[1])}`).join(';'))
          .join('|');

  return (
    <View
      style={{
        zIndex: 1,
        elevation: 1,
        position: 'absolute',
        height: '100%',
        width: '100%',
        pointerEvents: 'none',
      }}
      //タッチイベントを無効化。MapViewのタッチイベントを優先させるため
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <G key={iosRemountKey}>
        {drawLine.current.map(({ xy, properties }: { xy: any; properties: any }, idx: number) => {
          // フリーハンドツールの場合はマーカーを表示しない
          const isFreehand = isFreehandTool(currentDrawTool);

          // 最初のポイントを強調表示（編集モード時、プロット・分割・地図移動(MOVE)ツール）
          const isFirstPointHighlighted =
            properties.includes('EDIT') &&
            (isPlotTool(currentDrawTool) || currentDrawTool === 'SPLIT_LINE' || currentDrawTool === 'MOVE');

          // 編集中(EDIT)オブジェクトは、地図移動(MOVE)モードでも全頂点のマーカーを表示する。
          // SELECTモードと非編集ラインの挙動は従来どおり。
          const startStyle = isFreehand
            ? ''
            : properties.includes('EDIT')
            ? currentDrawTool === 'SELECT'
              ? ''
              : isFirstPointHighlighted
              ? `url(#firstPoint)`
              : `url(#add)`
            : currentDrawTool === 'SELECT' || currentDrawTool === 'MOVE'
            ? ''
            : isEditingObject
            ? ''
            : `url(#delete)`;
          const midStyle =
            properties.includes('EDIT') &&
            (isPlotTool(currentDrawTool) || currentDrawTool === 'SPLIT_LINE' || currentDrawTool === 'MOVE')
              ? `url(#plot)`
              : '';
          const endStyle = isFreehand
            ? ''
            : properties.includes('EDIT')
            ? `url(#firstPoint)`
            : properties.includes('POINT')
            ? `url(#point)`
            : '';

          const strokeColor = properties.includes('EDIT') ? 'lightblue' : '#F7C114';

          return (
            <G key={ulid()}>
              {properties.includes('EDIT') && (
                <Path d={pointsToSvg(xy)} stroke={'blue'} strokeWidth="4" fill="none" />
              )}
              <Path
                d={pointsToSvg(xy)}
                stroke={strokeColor}
                strokeWidth="2"
                strokeDasharray={'none'}
                fill={
                  isPolygonTool(currentDrawTool)
                    ? properties.includes('EDIT')
                      ? COLOR.ALFABLUE2
                      : COLOR.ALFAYELLOW
                    : 'none'
                }
                // ネイティブマーカー（markerStart/Mid/End）は使わず、下の明示描画に統一する
                // （iOS=新規マウントで消える / Android=サイズが大きい、を回避）
              />
              {renderVertexMarkers(xy, startStyle, midStyle, endStyle, idx)}
            </G>
          );
        })}
        {/* 修正のライン */}
        {!isPlotTool(currentDrawTool) && (
          <G>
            <Path
              d={pointsToSvg(editingLine.current)}
              stroke="blue"
              strokeWidth="2.5"
              strokeDasharray="2,3"
              fill="none"
            />
          </G>
        )}
        {/* 選択範囲のライン */}
        <G>
          <Path
            d={pointsToSvg(selectLine.current)}
            stroke={`${COLOR.YELLOW}`}
            strokeWidth="2"
            strokeDasharray="1"
            fill={`${COLOR.ALFAYELLOW}`}
          />
        </G>
        </G>
      </Svg>
    </View>
  );
});
