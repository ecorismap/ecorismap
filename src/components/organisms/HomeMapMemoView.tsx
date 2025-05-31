import React, { useContext, useMemo } from 'react';
import Svg, { Circle, G, Path, Line, Text, Rect, Polygon } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { MapMemoContext } from '../../contexts/MapMemo';
import { SVGDrawingContext } from '../../contexts/SVGDrawing';
import { View } from 'react-native';
import { isBrushTool, isPenTool } from '../../utils/General';
import { ulid } from 'ulid';
import { MapMemoToolType } from '../../types';

export const MapMemoView = React.memo(() => {
  const {
    penColor,
    penWidth,
    currentMapMemoTool,
    //zoom: currentZoom,
    mapMemoLines,
  } = useContext(MapMemoContext);
  const { mapMemoEditingLine } = useContext(SVGDrawingContext);
  // Note: We don't need isEditingLine from DrawingToolsContext for MapMemo functionality
  //const strokeWidth = 2 ** (currentZoom - 18) * penWidth;

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
            d={pointsToSvg(mapMemoEditingLine)}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
            strokeDasharray={'none'}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={'none'}
          />
        )}
        {mapMemoLines.map((line, index) => (
          <Path
            key={index}
            d={`M${line.xy.map((p) => `${p[0]},${p[1]}`).join(' L')}`}
            stroke={line.strokeColor}
            strokeWidth={line.strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </Svg>
    </View>
  );
});

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
