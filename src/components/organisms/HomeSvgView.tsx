import React, { useContext } from 'react';
import { Platform, View } from 'react-native';

import Svg, { G, Defs, Marker, Path, Circle, Rect } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { ulid } from 'ulid';
import { COLOR } from '../../constants/AppConstants';
import { isFreehandTool, isPlotTool, isPolygonTool } from '../../utils/General';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { SVGDrawingContext } from '../../contexts/SVGDrawing';

export const SvgView = React.memo(() => {
  const { currentDrawTool, isEditingObject } = useContext(DrawingToolsContext);
  const { drawLine, editingLine, selectLine } = useContext(SVGDrawingContext);

  const editingStartStyle = '';
  const editingMidStyle = '';
  const editingEndStyle = '';

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
        <LineDefs />
        {drawLine.current.map(({ xy, properties }: { xy: any; properties: any }, idx: number) => {
          // フリーハンドツールの場合はマーカーを表示しない
          const isFreehand = isFreehandTool(currentDrawTool);

          // 最初のポイントを強調表示（編集モード時、プロットツールまたは分割ツール）
          const isFirstPointHighlighted = properties.includes('EDIT') && (isPlotTool(currentDrawTool) || currentDrawTool === 'SPLIT_LINE');

          const startStyle = isFreehand
            ? ''
            : currentDrawTool === 'SELECT' || currentDrawTool === 'MOVE'
            ? ''
            : properties.includes('EDIT')
            ? isFirstPointHighlighted ? `url(#firstPoint)` : `url(#add)`
            : isEditingObject
            ? ''
            : `url(#delete)`;
          const midStyle =
            currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON' || currentDrawTool === 'SPLIT_LINE'
              ? properties.includes('EDIT')
                ? `url(#plot)`
                : ''
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
                <Path id={`path${idx}`} d={pointsToSvg(xy)} stroke={'blue'} strokeWidth="4" fill="none" />
              )}
              <Path
                id={`path${idx}`}
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
                markerStart={startStyle}
                markerMid={midStyle}
                markerEnd={endStyle}
              />
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
              markerStart={editingStartStyle}
              markerMid={editingMidStyle}
              markerEnd={editingEndStyle}
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
      </Svg>
    </View>
  );
});

const LineDefs = () => {
  const OS_ASPECT_RATIO = Platform.OS === 'android' ? 2 : 0.8;
  return (
    <Defs>
      <G id="markers">
        <Marker
          id="arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth="6"
          markerHeight="5"
          orient="auto"
        >
          <Path stroke="black" strokeWidth="1" fill="black" d="M 0 0 L 10 5 L 0 10 z" />
        </Marker>
        <Marker
          id="dot"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth="4"
          markerHeight="4"
          orient="auto"
        >
          <Circle cx="5" cy="5" r="5" fill="black" stroke="white" />
        </Marker>
        <Marker
          id="point"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth={15 * OS_ASPECT_RATIO}
          markerHeight={15 * OS_ASPECT_RATIO}
          orient="0"
        >
          <Circle cx="5" cy="5" r="3" fill="yellow" stroke="black" strokeWidth="1" />
        </Marker>

        <Marker
          id="firstPoint"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth={15 * OS_ASPECT_RATIO}
          markerHeight={15 * OS_ASPECT_RATIO}
          orient="0"
        >
          <Circle cx="5" cy="5" r="3.5" fill={COLOR.BLUE} stroke="white" strokeWidth="1.5" />
        </Marker>

        <Marker
          id="add"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth={15 * OS_ASPECT_RATIO}
          markerHeight={15 * OS_ASPECT_RATIO}
          orient="0"
        >
          <Circle cx="5" cy="5" r="5" fill={COLOR.ALFABLUE} stroke="blue" strokeWidth="1" />
          <Path stroke={COLOR.WHITE} strokeWidth="3" d="M 0 5 L 10 5 z" />
          <Path stroke={COLOR.WHITE} strokeWidth="3" d="M 5 0 L 5 10 z" />
        </Marker>
        <Marker
          id="delete"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth={15 * OS_ASPECT_RATIO}
          markerHeight={15 * OS_ASPECT_RATIO}
          orient="0"
        >
          <Circle cx="5" cy="5" r="5" fill="grey" stroke="darkgrey" strokeWidth="1" />
          <Path stroke={COLOR.WHITE} strokeWidth="1.5" d="M 2 2 L 8 8 z" />
          <Path stroke={COLOR.WHITE} strokeWidth="1.5" d="M 2 8 L 8 2 z" />
        </Marker>

        <Marker
          id="plot"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth={15 * OS_ASPECT_RATIO}
          markerHeight={15 * OS_ASPECT_RATIO}
          orient="0"
        >
          <Circle cx="5" cy="5" r="3.5" fill={COLOR.BLUE} stroke="white" strokeWidth="1.5" />
        </Marker>
        <Marker
          id="last"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth={12 * OS_ASPECT_RATIO}
          markerHeight={12 * OS_ASPECT_RATIO}
          orient="0"
        >
          <Rect width="10" height="10" fill="white" stroke="blue" strokeWidth="1.5" />
        </Marker>
      </G>
    </Defs>
  );
};
