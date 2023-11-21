import React, { useContext } from 'react';
import Svg, { Path } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { HomeContext } from '../../contexts/Home';
import { View } from 'react-native';

export const MapMemoView = React.memo(() => {
  const {
    penColor,
    penWidth,
    mapMemoEditingLine,
    currentMapMemoTool,
    //zoom: currentZoom,
    mapMemoLines,
  } = useContext(HomeContext);
  //const strokeWidth = 2 ** (currentZoom - 18) * penWidth;

  return (
    <View
      style={{
        zIndex: 1,
        elevation: 1,
        position: 'absolute',
        height: '100%',
        width: '100%',
      }}
      //タッチイベントを無効化。MapViewのタッチイベントを優先させるため
      pointerEvents={'none'}
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
