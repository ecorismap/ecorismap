import { Position } from '@turf/turf';
import React, { useMemo } from 'react';
import {
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  PanResponderInstance,
  View,
} from 'react-native';

import Svg, { G, Defs, Marker, Path, Circle } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { v4 as uuidv4 } from 'uuid';
import { LineToolType, RecordType } from '../../types';
import { COLOR, PLUGIN } from '../../constants/AppConstants';
import { HisyouSVG } from '../../plugins/hisyoutool/HisyouSvg';

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
  currentLineTool: LineToolType;
  onPress: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  onMove: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
  onRelease: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => void;
}
//React.Memoすると描画が更新されない
export const SvgView = (props: Props) => {
  const { drawLine, editingLine, selectLine, currentLineTool, onPress, onMove, onRelease } = props;

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
          let startStyle = '';
          let endStyle = '';
          if (PLUGIN.HISYOUTOOL) {
            startStyle = properties.includes('TOMARI') ? `url(#dot)` : '';
            endStyle = properties.includes('arrow') ? 'url(#arrow)' : '';
          }
          return (
            <G key={uuidv4()}>
              <Path
                id={`path${idx}`}
                d={pointsToSvg(xy)}
                stroke={'blue'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={properties.includes('DRAW') || properties.length === 0 ? '4,6' : '4,6'}
                fill={currentLineTool === 'AREA' ? COLOR.ALFABLUE2 : 'none'}
                markerStart={startStyle}
                markerEnd={endStyle}
              />
              {PLUGIN.HISYOUTOOL && <HisyouSVG id={idx} properties={properties} strokeColor={'blue'} />}
            </G>
          );
        })}
        {/* 修正のライン */}
        <G>
          <Path
            d={pointsToSvg(editingLine.xy)}
            stroke="pink"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1"
            fill="none"
          />
        </G>
        {/* 選択範囲のライン */}
        <G>
          <Path
            d={pointsToSvg(selectLine)}
            stroke={`${COLOR.YELLOW}`}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="4,6"
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
        refY="5"
        //@ts-ignore
        markerUnits="strokeWidth"
        markerWidth="4"
        markerHeight="4"
        orient="auto"
      >
        <Circle cx="5" cy="5" r="5" fill="blue" stroke="white" />
      </Marker>
    </Defs>
  );
};
