import React, { useContext, useMemo } from 'react';
import { Platform, View } from 'react-native';

import Svg, { G, Path, Circle, Line, Polygon } from 'react-native-svg';
import { interpolateLineString, latLonToXY, pointsToSvg, getRotatedPointsTransformFrame } from '../../utils/Coords';
import { BrushSymbol } from './HomeBrushSymbol';
import { hasStampSymbol, StampSymbol } from './HomeStampSymbol';
import { useWindow } from '../../hooks/useWindow';
import { ulid } from 'ulid';
import { COLOR } from '../../constants/AppConstants';
import { isBrushTool, isHandwritingTool, isPlotTool } from '../../utils/General';
import { getMapMemoSymbolScaleAtZoom, SYMBOL_BASE_SIZE_PX, SYMBOL_BASE_ZOOM } from '../../utils/Layer';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { MapMemoContext } from '../../contexts/MapMemo';
import { SVGDrawingContext } from '../../contexts/SVGDrawing';
import { ArrowHeads, RenderStamp } from './HomeMapMemoView';
import { ArrowStyleType, MapMemoToolType } from '../../types';
import { Position } from 'geojson';

// 頂点マーカーは markerStart/markerMid/markerEnd（ネイティブMarker定義）を使わず、
// 各頂点に図形を直接描画する。理由:
//  ・iOS(react-native-svg 15): Svg新規マウント時に <Defs> の <Marker> 登録がpath描画に
//    間に合わず markerStart/markerMid が描画されない（地図移動後の再表示で連結点が消える）
//  ・Android: markerUnits のスケール解釈がiOS/Webと異なりマーカーが大きくなる
// 明示描画なら全プラットフォームでサイズ・挙動が一致する。
// サイズは従来のmarkerWidth=12・viewBox=10（1単位≒2.4px）相当に合わせている。
//編集選択で選んだ記号を囲む円の大きさ（記号より一回り大きくする）
const SELECTION_RING_RADIUS_PX = 22;

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
  const { currentDrawTool, featureButton, isEditingObject, isAreaSelected, editingLayer } =
    useContext(DrawingToolsContext);

  //飛翔図は描いている最中も保存後と同じ色で見せる（どの種で描いているかが分かるように）。
  //色は選んでいる属性（種名）から色分け設定を引く。未選択なら従来の編集表示（青）にする
  const paletteStrokeColor = useMemo(() => {
    if (editingLayer?.toolPalette !== 'HISYOU') return undefined;
    if (editingLayer.colorStyle.colorType !== 'CATEGORIZED') return undefined;
    const value = editingLayer.field.find((f) => f.name === editingLayer.colorStyle.fieldName)?.defaultValue;
    if (typeof value !== 'string' || value === '') return undefined;
    return editingLayer.colorStyle.colorList.find((c) => c.value === value)?.color;
  }, [editingLayer]);
  const paletteStrokeWidth = editingLayer?.colorStyle.lineWidth ?? 1.5;

  const { mapRegion, mapSize } = useWindow();
  //ブラシ（行動範囲）は確定後に記号として地図へ描かれる。確定前も同じ間隔・角度で記号を出して
  //どんな記号が付くのか分かるようにする（間隔・角度の計算は保存後の描画と同じ）
  //描画時よりズームアウトしたら記号を縮小する（保存後の描画と同じ計算。整数ズームで比較する）
  //保存後と同じ計算（基準ズームより引いたときだけ縮小する）
  const symbolScale = () => getMapMemoSymbolScaleAtZoom(Math.floor(mapRegion.zoom));
  //矢印の大きさ。飛翔線のように線幅がズームで変わらない線（色分けが個別でない）は
  //縮小せず行動記号と同じ基準の大きさで固定する。
  //個別色の手書きは線幅から決まる従来どおりの大きさにする
  const isIndividualStroke =
    editingLayer?.colorStyle.colorType === 'INDIVIDUAL' &&
    editingLayer.colorStyle.fieldName === '__CUSTOM' &&
    editingLayer.colorStyle.customFieldValue === '_strokeColor';
  const arrowSizeScale = isIndividualStroke ? 1 : SYMBOL_BASE_SIZE_PX / 20;
  //記号は20の座標系で描いてあるので、基準サイズに合わせて拡大する
  const symbolDrawScale = () => (symbolScale() * SYMBOL_BASE_SIZE_PX) / 20;

  const brushSymbolPoints = (latlon: Position[]) => {
    if (latlon.length < 2) return [];
    try {
      //間隔も基準ズームで固定する（保存後と同じ計算）
      const zoom = Math.floor(mapRegion.zoom);
      const scale = symbolScale();
      const intervalZoom = scale < 1 ? SYMBOL_BASE_ZOOM : zoom;
      return interpolateLineString(latlon, 1 / 2 ** (intervalZoom - 10)).map((point) => ({
        xy: latLonToXY(point.coordinates as Position, mapRegion, mapSize, mapViewRef),
        angle: point.angle,
        scale: symbolDrawScale(),
      }));
    } catch (e) {
      return [];
    }
  };
  const { drawLine, editingLine, selectLine, featuresTransformAngle, mapViewRef } = useContext(SVGDrawingContext);
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
            //release前（style未確定）のスタンプは現在のペン設定で表示する。
            //飛翔図は保存後と同じ色（種名の色）で描き、線と行動記号の見た目を揃える
            const strokeColor = paletteStrokeColor ?? style?.strokeColor ?? penColor;
            if (style !== undefined && style.stamp !== '') {
              //編集選択で選んだ記号は、選ばれていることが分かるよう円で囲む
              //（記号そのものには編集用の装飾が無く、選択できたのか分からないため）
              const selectionRing =
                line.record !== undefined && xy.length > 0 ? (
                  <Circle
                    cx={xy[0][0]}
                    cy={xy[0][1]}
                    r={SELECTION_RING_RADIUS_PX}
                    stroke={COLOR.BLUE}
                    strokeWidth={2.5}
                    strokeDasharray="4,3"
                    fill={COLOR.ALFABLUE2}
                  />
                ) : null;
              //記号は保存後と同じ図形・大きさで出す（数字・英字・文字はラベルが要るので従来の仮表示）
              if (hasStampSymbol(style.stamp) && xy.length > 0) {
                const scale = symbolDrawScale();
                return (
                  <G key={ulid()}>
                    {selectionRing}
                    <G transform={`translate(${xy[0][0]},${xy[0][1]}) scale(${scale}) translate(-10,-10)`}>
                      <StampSymbol stamp={style.stamp} lineColor={strokeColor} />
                    </G>
                  </G>
                );
              }
              return (
                <G key={ulid()}>
                  {selectionRing}
                  <RenderStamp
                    stampPos={xy.length > 0 ? { x: xy[0][0], y: xy[0][1] } : undefined}
                    currentMapMemoTool={style.stamp as MapMemoToolType}
                    strokeColor={strokeColor}
                  />
                </G>
              );
            }
            //編集中のポリゴンは従来どおり半透明の青で塗り、青＋水色の線で描く。
            //ツール名で判定すると地図移動へ持ち替えたときに塗りが消えるためタブで見る
            if (featureButton === 'POLYGON') {
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
            //編集中（未確定）のストロークは従来の編集表示と同じ青＋水色の線で描く。
            //飛翔図だけは保存後と同じ色・太さで描く（種の見分けが付かないと描き分けられないため）
            const previewColor = paletteStrokeColor ?? 'lightblue';
            const previewWidth = paletteStrokeColor === undefined ? 2 : paletteStrokeWidth;
            //なぞり終えたブラシは記号で表示する（なぞっている最中は緯度経度がまだ無いので線で示す）
            const brushPoints = isBrushStroke ? brushSymbolPoints(line.latlon) : [];
            if (brushPoints.length > 0) {
              return (
                <G key={ulid()}>
                  {brushPoints.map((point, i) => (
                    <G
                      key={`${idx}-${i}`}
                      transform={`translate(${point.xy[0]},${point.xy[1]}) rotate(${point.angle}) scale(${point.scale}) translate(-10,-10)`}
                    >
                      <BrushSymbol strokeStyle={String(style?.strokeStyle ?? '')} lineColor={previewColor} />
                    </G>
                  ))}
                </G>
              );
            }
            return (
              <G key={ulid()}>
                {paletteStrokeColor === undefined ? (
                  <Path
                    d={pointsToSvg(xy)}
                    stroke="blue"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                ) : (
                  //本来の色で描くと未確定か分からないので、青のハローを敷いて編集中を示す
                  <Path
                    d={pointsToSvg(xy)}
                    stroke="blue"
                    strokeOpacity={0.2}
                    strokeWidth={previewWidth + 4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                )}
                <Path
                  d={pointsToSvg(xy)}
                  stroke={previewColor}
                  strokeWidth={previewWidth}
                  strokeDasharray={isBrushStroke ? '4,4' : 'none'}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
                {!isBrushStroke && (arrowStyle === 'ARROW_END' || arrowStyle === 'ARROW_BOTH') && (
                  <ArrowHeads
                    points={xy}
                    strokeColor={previewColor}
                    strokeWidth={previewWidth}
                    arrowStyle={arrowStyle}
                    sizeScale={arrowSizeScale}
                  />
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
                  featureButton === 'POLYGON'
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
        {/* 修正のライン（手書きのなぞり修正中のみ。プロット中や地図移動中に
            前の軌跡が残っていてもゴーストを描かない） */}
        {isHandwritingTool(currentDrawTool) && (
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
