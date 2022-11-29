import { Position } from '@turf/turf';
import React from 'react';
import { PanResponderInstance, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { v4 as uuidv4 } from 'uuid';
import { DrawLineToolType, RecordType } from '../../types';

interface Props {
  panResponder: PanResponderInstance;
  drawLine: {
    id: string;
    coords: Position[];
    properties: (DrawLineToolType | '')[];
    arrow: number;
  }[];
  modifiedLine: {
    start: Position;
    coords: Position[];
  };
  selectedRecord: {
    layerId: string;
    record: RecordType | undefined;
  };
}
//React.Memoすると描画が更新されない
export const SvgLine = (props: Props) => {
  const { panResponder, drawLine, modifiedLine, selectedRecord } = props;

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
        {drawLine.map(({ id, coords, properties }, idx: number) => {
          const strokeColor = selectedRecord.record !== undefined && selectedRecord.record.id === id ? 'blue' : 'blue';

          return (
            <G key={uuidv4()}>
              <Path
                id={`path${idx}`}
                d={pointsToSvg(coords)}
                stroke={strokeColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={properties[0] === 'DRAW' || properties.length === 0 ? '4,6' : '1'}
                fill="none"
              />
            </G>
          );
        })}

        <G>
          <Path
            d={pointsToSvg(modifiedLine.coords)}
            stroke="blue"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1"
            fill="none"
          />
        </G>
      </Svg>
    </View>
  );
};
