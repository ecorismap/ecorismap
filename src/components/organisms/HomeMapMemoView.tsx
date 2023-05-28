import React, { useContext } from 'react';
import Svg, { Path } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { HomeContext } from '../../contexts/Home';
import { View } from 'react-native';

export const MapMemoView = React.memo(() => {
  const { penColor, penWidth, mapMemoEditingLine, currentMapMemoTool, panResponder } = useContext(HomeContext);

  return (
    <View
      style={{
        zIndex: 1,
        elevation: 1,
        position: 'absolute',
        height: '100%',
        width: '100%',
      }}
      pointerEvents={currentMapMemoTool === 'NONE' ? 'none' : 'auto'}
      {...panResponder.panHandlers}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Path
          d={pointsToSvg(mapMemoEditingLine)}
          stroke={currentMapMemoTool === 'ERASER' ? 'white' : penColor}
          strokeWidth={currentMapMemoTool === 'ERASER' ? 10 : penWidth}
          strokeDasharray={'none'}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill={'none'}
        />
      </Svg>
    </View>
  );
});
