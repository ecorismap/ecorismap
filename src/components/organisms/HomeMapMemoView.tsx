import React, { useContext, useMemo } from 'react';
import Svg, { Circle, G, Path, Line, Text, Rect, Polygon } from 'react-native-svg';
import { latLonArrayToXYArray, pointsToSvg } from '../../utils/Coords';
import { MapMemoContext } from '../../contexts/MapMemo';
import { SVGDrawingContext } from '../../contexts/SVGDrawing';
import { Platform, View } from 'react-native';
import { isBrushTool, isPenTool } from '../../utils/General';
import { ulid } from 'ulid';
import { Position } from 'geojson';
import { ArrowStyleType, MapMemoToolType } from '../../types';
import { useWindow } from '../../hooks/useWindow';

//iOSのGoogle Maps SDKはポリラインの線端指定(lineCap)をサポートせず常に平端(butt)のため、
//プレビューも平端に合わせて保存の瞬間に端の見た目が変わらないようにする。
//Android/Webは保存側をround指定にしてあるためプレビューもroundで一致する
const STROKE_CAP = Platform.OS === 'ios' ? 'butt' : 'round';

export const MapMemoView = React.memo(() => {
  const {
    penColor,
    penWidth,
    currentMapMemoTool,
    mapMemoLines,
    arrowStyle,
  } = useContext(MapMemoContext);
  const { mapMemoEditingLine, mapMemoEditingLineLatLon, mapViewRef } = useContext(SVGDrawingContext);
  const { mapRegion, mapSize } = useWindow();

  //ペン・消しゴムのストロークは緯度経度で保持されているため、現在の地図表示に合わせて再投影する。
  //これにより描画途中のピンチや自動パン、保存デバウンス中の地図移動にも線が追従する
  const editingLineXY = useMemo(
    () => latLonArrayToXYArray(mapMemoEditingLineLatLon, mapRegion, mapSize, mapViewRef),
    [mapMemoEditingLineLatLon, mapRegion, mapSize, mapViewRef]
  );

  const stampPos = useMemo(
    () => (mapMemoEditingLine.length === 1 ? { x: mapMemoEditingLine[0][0], y: mapMemoEditingLine[0][1] } : undefined),
    [mapMemoEditingLine]
  );

  const strokeColor = useMemo(
    () => (currentMapMemoTool.includes('ERASER') ? 'white' : isBrushTool(currentMapMemoTool) ? 'yellow' : penColor),
    [currentMapMemoTool, penColor]
  );
  const strokeWidth = useMemo(
    () => (currentMapMemoTool.includes('ERASER') ? 10 : isBrushTool(currentMapMemoTool) ? 5 : penWidth),
    [currentMapMemoTool, penWidth]
  );

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
        <RenderStamp stampPos={stampPos} currentMapMemoTool={currentMapMemoTool} strokeColor={strokeColor} />
        {isBrushTool(currentMapMemoTool) && (
          <G key={ulid()}>
            <Path
              id={`path`}
              d={pointsToSvg(mapMemoEditingLine)}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
              strokeDasharray={'none'}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={'none'}
            />
          </G>
        )}
        {(isPenTool(currentMapMemoTool) || currentMapMemoTool.includes('ERASER')) && (
          <Path
            d={pointsToSvg(editingLineXY)}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={'none'}
            strokeLinecap={STROKE_CAP}
            strokeLinejoin="round"
            fill={'none'}
          />
        )}
        {isPenTool(currentMapMemoTool) && (
          <ArrowHeads points={editingLineXY} strokeColor={penColor} strokeWidth={penWidth} arrowStyle={arrowStyle} />
        )}
        {mapMemoLines.map((line, index) => {
          const lineXY = latLonArrayToXYArray(line.latlon, mapRegion, mapSize, mapViewRef);
          return (
            <G key={index}>
              <Path
                d={pointsToSvg(lineXY)}
                stroke={line.strokeColor}
                strokeWidth={line.strokeWidth}
                fill="none"
                strokeLinecap={STROKE_CAP}
                strokeLinejoin="round"
              />
              <ArrowHeads
                points={lineXY}
                strokeColor={line.strokeColor}
                strokeWidth={line.strokeWidth}
                arrowStyle={(line.strokeStyle || 'NONE') as ArrowStyleType}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
});

//作図中・保存待ちの線に付ける矢印プレビュー。保存後に表示されるLineArrow(マーカー)と同じ形状・サイズを
//スクリーン座標のSVGで描き、指を離して保存されるまでの間も矢印が途切れず見えるようにする
const ArrowHeads = React.memo(
  ({
    points,
    strokeColor,
    strokeWidth,
    arrowStyle,
  }: {
    points: Position[];
    strokeColor: string;
    strokeWidth: number;
    arrowStyle: ArrowStyleType;
  }) => {
    if (arrowStyle === 'NONE' || points.length < 2) return null;
    //LineArrow.tsxと同じスケール計算。strokeWidthが1未満でも負の平方根にならないようクランプ
    const scale = Math.sqrt(Math.max(strokeWidth - 1, 0.25));
    const size = 20 * scale;
    const d = `M${10 * scale} ${7 * scale} L${5 * scale} ${20 * scale} L${10 * scale} ${18 * scale} L${
      15 * scale
    } ${20 * scale} Z`;
    const p0 = points[0];
    const p1 = points[1];
    const p2 = points[points.length - 2];
    const p3 = points[points.length - 1];
    //矢印形状は上向きが基準のため+90度補正(+450=+360+90)
    const angleEnd = (Math.atan2(p3[1] - p2[1], p3[0] - p2[0]) * (180 / Math.PI) + 450) % 360;
    const angleStart = (Math.atan2(p0[1] - p1[1], p0[0] - p1[0]) * (180 / Math.PI) + 450) % 360;
    return (
      <G>
        <Path
          d={d}
          fill={strokeColor}
          stroke="white"
          transform={`translate(${p3[0] - size / 2},${p3[1] - size / 2}) rotate(${angleEnd}, ${size / 2}, ${
            size / 2
          })`}
        />
        {arrowStyle === 'ARROW_BOTH' && (
          <Path
            d={d}
            fill={strokeColor}
            stroke="white"
            transform={`translate(${p0[0] - size / 2},${p0[1] - size / 2}) rotate(${angleStart}, ${size / 2}, ${
              size / 2
            })`}
          />
        )}
      </G>
    );
  }
);

const RenderStamp = React.memo(
  ({
    stampPos,
    currentMapMemoTool,
    strokeColor,
  }: {
    stampPos:
      | {
          x: number;
          y: number;
        }
      | undefined;
    currentMapMemoTool: MapMemoToolType;
    strokeColor: string;
  }) => {
    if (!stampPos) return null; // stampPosがundefinedの場合は何もレンダリングしない

    switch (currentMapMemoTool) {
      case 'TOMARI':
        return <Circle cx={stampPos.x} cy={stampPos.y} r="4" stroke="#ffffffaa" strokeWidth="1" fill={strokeColor} />;
      case 'KARI':
        return (
          <G key={ulid()}>
            <Line
              x1={stampPos.x - 4}
              y1={stampPos.y - 4}
              x2={stampPos.x + 4}
              y2={stampPos.y + 4}
              stroke={strokeColor}
              strokeWidth="2"
            />
            <Line
              x1={stampPos.x + 4}
              y1={stampPos.y - 4}
              x2={stampPos.x - 4}
              y2={stampPos.y + 4}
              stroke={strokeColor}
              strokeWidth="2"
            />
          </G>
        );
      case 'HOVERING':
        return (
          <G key={ulid()}>
            <Circle cx={stampPos.x} cy={stampPos.y} r="7" stroke={strokeColor} strokeWidth="1" fill="#ffffffaa" />
            <Text
              x={stampPos.x}
              y={stampPos.y + 4}
              fontSize="12"
              fontWeight="bold"
              fill={strokeColor}
              textAnchor="middle"
            >
              H
            </Text>
          </G>
        );
      case 'SQUARE':
        return (
          <Rect
            x={stampPos.x - 6}
            y={stampPos.y - 6}
            width="12"
            height="12"
            stroke={strokeColor}
            strokeWidth="2"
            fill={strokeColor}
          />
        );
      case 'CIRCLE':
        return <Circle cx={stampPos.x} cy={stampPos.y} r="6" stroke={strokeColor} strokeWidth="2" fill={strokeColor} />;
      case 'TRIANGLE':
        return (
          <Polygon
            points={`${stampPos.x},${stampPos.y - 6.32} ${stampPos.x - 8},${stampPos.y + 8} ${stampPos.x + 8},${
              stampPos.y + 8
            }`}
            stroke={strokeColor}
            strokeWidth="0"
            fill={strokeColor}
          />
        );
      default:
        return null;
    }
  }
);
