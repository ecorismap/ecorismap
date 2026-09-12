import React, { useContext } from 'react';
import { Platform, View } from 'react-native';

import Svg, { G, Path, Circle, Line, Polygon } from 'react-native-svg';
import { pointsToSvg, getRotatedPointsTransformFrame } from '../../utils/Coords';
import { ulid } from 'ulid';
import { COLOR } from '../../constants/AppConstants';
import { isBrushTool, isHandwritingTool, isPlotTool, isPolygonTool } from '../../utils/General';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { MapMemoContext } from '../../contexts/MapMemo';
import { SVGDrawingContext } from '../../contexts/SVGDrawing';
import { ArrowHeads, RenderStamp } from './HomeMapMemoView';
import { ArrowStyleType, MapMemoToolType } from '../../types';

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
  const { currentDrawTool, isEditingObject, isAreaSelected } = useContext(DrawingToolsContext);
  const { drawLine, editingLine, selectLine, featuresTransformAngle } = useContext(SVGDrawingContext);
  //スタンプは描画中（style未確定）でも現在のペン色で表示する
  const { penColor } = useContext(MapMemoContext);

  // New Architecture（Fabric）のiOSでは、同じSvgインスタンス内の子要素をRef駆動（drawLine.current）で
  // 更新しても再描画されないため、内容が変わる境界でSvgを再マウントして反映させる。
  // ・プロット系（ポイント/ライン/ポリゴン）と編集中: 全ノードの座標をシグネチャに含め、点の追加・
  //   位置移動・削除のいずれにも追従する
  // ・フリーハンド: 1ストロークで点が連続追加されるため、座標シグネチャだと毎フレーム再マウントになり
  //   重く・ちらつくので、描画対象の有無（空↔非空）の境界でのみ再マウントする
  const iosRemountKey =
    Platform.OS !== 'ios'
      ? undefined
      : isHandwritingTool(currentDrawTool)
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
        {drawLine.current.map((line: any, idx: number) => {
          const { xy, properties } = line;

          //手書きの未確定ストロークは従来の編集表示（青＋水色の線）で描く。
          //スタンプだけは記号の形が分からないと困るのでペンの色で表示する
          if (properties.includes('HANDWRITING')) {
            const style = line.style;
            //release前（style未確定）のスタンプは現在のペン設定で表示する
            const strokeColor = style?.strokeColor ?? penColor;
            if (style !== undefined && style.stamp !== '') {
              return (
                <G key={ulid()}>
                  <RenderStamp
                    stampPos={xy.length > 0 ? { x: xy[0][0], y: xy[0][1] } : undefined}
                    currentMapMemoTool={style.stamp as MapMemoToolType}
                    strokeColor={strokeColor}
                  />
                </G>
              );
            }
            //編集中のポリゴンは従来どおり半透明の青で塗り、青＋水色の線で描く
            if (currentDrawTool === 'HANDWRITING_POLYGON') {
              return (
                <G key={ulid()}>
                  <Path d={pointsToSvg(xy)} stroke="none" fill={COLOR.ALFABLUE2} />
                  <Path
                    d={pointsToSvg(xy)}
                    stroke="blue"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                  <Path
                    d={pointsToSvg(xy)}
                    stroke="lightblue"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </G>
              );
            }
            //ブラシは確定（一括保存）後に記号として描画されるため、セッション中はなぞった線で示す
            const isBrushStroke = style !== undefined && isBrushTool(style.strokeStyle);
            const arrowStyle = (style?.strokeStyle || 'NONE') as ArrowStyleType;
            //編集中（未確定）のストロークは新規・編集選択を問わず、従来の編集表示と同じ
            //青＋水色の線で描く（確定すると本来の色・太さで地図に描かれる）
            return (
              <G key={ulid()}>
                <Path
                  d={pointsToSvg(xy)}
                  stroke="blue"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                <Path
                  d={pointsToSvg(xy)}
                  stroke="lightblue"
                  strokeWidth="2"
                  strokeDasharray={isBrushStroke ? '4,4' : 'none'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                {!isBrushStroke && (arrowStyle === 'ARROW_END' || arrowStyle === 'ARROW_BOTH') && (
                  <ArrowHeads points={xy} strokeColor="lightblue" strokeWidth={2} arrowStyle={arrowStyle} />
                )}
              </G>
            );
          }

          // 最初のポイントを強調表示（編集モード時、プロット・分割・地図移動(MOVE)ツール）
          const isFirstPointHighlighted =
            properties.includes('EDIT') &&
            (isPlotTool(currentDrawTool) || currentDrawTool === 'SPLIT_LINE' || currentDrawTool === 'MOVE');

          // 編集中(EDIT)オブジェクトは、地図移動(MOVE)モードでも全頂点のマーカーを表示する。
          // SELECTモードと非編集ラインの挙動は従来どおり。
          const startStyle = properties.includes('EDIT')
            ? isFirstPointHighlighted
              ? `url(#firstPoint)`
              : ''
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
          const endStyle = properties.includes('EDIT')
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
        {/* なげなわ選択時の変形フレーム（ドラッグで移動・ハンドルで回転）。ポイント・ライン・ポリゴン共通、1件でも表示 */}
        {isAreaSelected &&
          (isPlotTool(currentDrawTool) || currentDrawTool === 'MOVE') &&
          drawLine.current.length >= 1 &&
          drawLine.current.every((line) => line.xy.length > 0) &&
          (() => {
            //回転してもボックスが形を保ったままオブジェクトと一緒に回るよう、累積回転角つきで枠を求める
            const frame = getRotatedPointsTransformFrame(
              drawLine.current.flatMap((line) => line.xy),
              featuresTransformAngle.current ?? 0
            );
            const [hx, hy] = frame.handle;
            //地図移動(MOVE)中はジェスチャが地図に取られるため回転ハンドルを隠す。
            //単一ポイントは回転しても変化しないためハンドルを出さない
            const isSinglePoint = drawLine.current.length === 1 && drawLine.current[0].xy.length === 1;
            const showHandle = currentDrawTool !== 'MOVE' && !isSinglePoint;
            return (
              <G>
                <Polygon
                  points={frame.corners.map((c) => c.join(',')).join(' ')}
                  stroke={COLOR.BLUE}
                  strokeWidth="1.5"
                  strokeDasharray="4,4"
                  fill="none"
                />
                {showHandle && (
                  <G>
                    <Line x1={frame.topMid[0]} y1={frame.topMid[1]} x2={hx} y2={hy} stroke={COLOR.BLUE} strokeWidth="1.5" />
                    <Circle cx={hx} cy={hy} r={14} fill={COLOR.BLUE} stroke="white" strokeWidth="2" />
                    {/* 回転を示す円弧矢印 */}
                    <Path
                      d={`M ${hx - 6} ${hy + 4} A 7 7 0 1 1 ${hx + 6} ${hy + 4}`}
                      stroke="white"
                      strokeWidth="2"
                      fill="none"
                    />
                    <Path d={`M ${hx + 6} ${hy + 4} l -4 -1 l 3 4 z`} stroke="white" strokeWidth="1" fill="white" />
                  </G>
                )}
                {drawLine.current.map((line, i) =>
                  line.xy.length === 1 ? (
                    <Circle
                      key={`tp-${i}`}
                      cx={line.xy[0][0]}
                      cy={line.xy[0][1]}
                      r={7.2}
                      fill="yellow"
                      stroke="black"
                      strokeWidth={2.4}
                    />
                  ) : null
                )}
              </G>
            );
          })()}
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
