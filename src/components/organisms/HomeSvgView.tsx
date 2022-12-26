import { Position } from '@turf/turf';
import React, { useMemo } from 'react';
import {
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  PanResponderInstance,
  View,
} from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { v4 as uuidv4 } from 'uuid';
import { DrawLineToolType, LineToolType, LocationType, RecordType } from '../../types';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  drawLine: {
    record: RecordType | undefined;
    xy: Position[];
    coords: LocationType[];
    properties: (DrawLineToolType | '')[];
    arrow: number;
  }[];
  modifiedLine: {
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
  const { drawLine, modifiedLine, selectLine, currentLineTool, onPress, onMove, onRelease } = props;

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
        {drawLine.map(({ xy, properties }, idx: number) => {
          return (
            <G key={uuidv4()}>
              <Path
                id={`path${idx}`}
                d={pointsToSvg(xy)}
                stroke={'blue'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={properties[0] === 'DRAW' || properties.length === 0 ? '4,6' : '1'}
                fill={currentLineTool === 'AREA' ? COLOR.ALFABLUE2 : 'none'}
              />
            </G>
          );
        })}

        <G>
          <Path
            d={pointsToSvg(modifiedLine.xy)}
            stroke="pink"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1"
            fill="none"
          />
        </G>
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
