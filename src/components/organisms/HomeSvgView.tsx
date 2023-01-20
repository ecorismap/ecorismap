import { Position } from '@turf/turf';
import React, { useMemo } from 'react';
import {
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  PanResponderInstance,
  View,
} from 'react-native';

import Svg, { G, Defs, Marker, Path, Circle, Rect } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { v4 as uuidv4 } from 'uuid';
import { DrawToolType, RecordType } from '../../types';
import { COLOR } from '../../constants/AppConstants';
import { HisyouSVG } from '../../plugins/hisyoutool/HisyouSvg';
import { isPolygonTool } from '../../utils/General';
import { useHisyouToolSetting } from '../../plugins/hisyoutool/useHisyouToolSetting';

interface Props {
  drawLine: {
    id: string;
    record: RecordType | undefined;
    xy: Position[];
    latlon: Position[];
    properties: string[];
  }[];
  editingLine: {
    start: Position;
    xy: Position[];
  };
  selectLine: Position[];
  currentDrawTool: DrawToolType;
  onPress: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  onMove: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  onRelease: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
}
//React.Memoすると描画が更新されない
export const SvgView = (props: Props) => {
  const { drawLine, editingLine, selectLine, currentDrawTool, onPress, onMove, onRelease } = props;
  const { isHisyouToolActive } = useHisyouToolSetting();

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          onPress(e, gestureState);
        },
        onPanResponderMove: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          onMove(e, gestureState);
        },
        onPanResponderRelease: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          onRelease(e, gestureState);
        },
      }),
    [onMove, onPress, onRelease]
  );

  let startStyle = currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON' ? `url(#startplot)` : '';
  let midStyle = currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON' ? `url(#plot)` : '';
  let endStyle = currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON' ? `url(#endplot)` : '';

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
      }}
      {...panResponder.panHandlers}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <LineDefs />
        {drawLine.map(({ xy, properties }, idx: number) => {
          if (properties.includes('POINT')) endStyle = `url(#point)`;

          if (isHisyouToolActive) {
            startStyle = '';
            midStyle = '';
            endStyle = properties.includes('arrow') ? 'url(#arrow)' : properties.includes('TOMARI') ? `url(#dot)` : '';
          }
          //console.log(properties, xy, pointsToSvg(xy));

          return (
            <G key={uuidv4()}>
              <Path
                id={`path${idx}`}
                d={pointsToSvg(xy)}
                stroke={'blue'}
                strokeWidth="1.5"
                strokeDasharray={properties.includes('PLOT') ? '1,3' : 'none'}
                fill={isPolygonTool(currentDrawTool) ? COLOR.ALFABLUE2 : 'none'}
                markerStart={startStyle}
                markerMid={midStyle}
                markerEnd={endStyle}
              />
              {isHisyouToolActive && <HisyouSVG id={idx} properties={properties} strokeColor={'blue'} />}
            </G>
          );
        })}
        {/* 修正のライン */}
        <G>
          <Path
            d={pointsToSvg(editingLine.xy)}
            stroke="pink"
            strokeWidth="1.5"
            strokeDasharray="none"
            fill="none"
            markerStart={editingStartStyle}
            markerMid={editingMidStyle}
            markerEnd={editingEndStyle}
          />
        </G>
        {/* 選択範囲のライン */}
        <G>
          <Path
            d={pointsToSvg(selectLine)}
            stroke={`${COLOR.YELLOW}`}
            strokeWidth="2"
            strokeDasharray="1"
            fill={`${COLOR.ALFAYELLOW}`}
          />
        </G>
      </Svg>
    </View>
  );
};

const LineDefs = () => {
  return (
    <Defs>
      <Marker
        id="arrow"
        viewBox="0 0 10 10"
        refX="8"
        refY="5"
        //@ts-ignore
        markerUnits="strokeWidth"
        markerWidth="5"
        markerHeight="4"
        orient="auto"
      >
        <Path stroke="blue" strokeWidth="1" fill="blue" d="M 0 0 L 10 5 L 0 10 z" />
      </Marker>
      <Marker
        id="dot"
        viewBox="0 0 10 10"
        refX="5"
        refY="7"
        //@ts-ignore
        markerUnits="strokeWidth"
        markerWidth="4"
        markerHeight="4"
        orient="auto"
      >
        <Circle cx="5" cy="5" r="5" fill="blue" stroke="white" />
      </Marker>
      <Marker
        id="point"
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        //@ts-ignore
        markerUnits="strokeWidth"
        markerWidth="4"
        markerHeight="4"
        orient="0"
      >
        <Circle cx="5" cy="5" r="10" fill="yellow" stroke="black" />
      </Marker>

      <Marker
        id="plot"
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        //@ts-ignore
        markerUnits="strokeWidth"
        markerWidth="5"
        markerHeight="5"
        orient="0"
      >
        <Rect width="10" height="10" stroke="blue" />
      </Marker>
      <Marker
        id="startplot"
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        //@ts-ignore
        markerUnits="strokeWidth"
        markerWidth="6"
        markerHeight="6"
        orient="0"
      >
        <Rect width="10" height="10" fill="darkorange" stroke="white" />
      </Marker>
      <Marker
        id="endplot"
        viewBox="0 0 10 10"
        refX="5"
        refY="5"
        //@ts-ignore
        markerUnits="strokeWidth"
        markerWidth="6"
        markerHeight="6"
        orient="0"
      >
        <Rect width="10" height="10" fill="blue" stroke="white" />
      </Marker>
    </Defs>
  );
};
