import React from 'react';
import { StyleSheet, Pressable } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import Svg, { Path } from 'react-native-svg';

interface Props {
  top: number;
  left: number;
  isTerrainActive: boolean;
  toggleTerrain: () => void;
}

export const HomeTerrainControl = React.memo((props: Props) => {
  //console.log('render ZoomButton');
  const { top, left, isTerrainActive, toggleTerrain } = props;

  const styles = StyleSheet.create({
    buttonContainer: {
      alignItems: 'center',
      backgroundColor: COLOR.WHITE,
      borderColor: COLOR.GRAY2,
      borderRadius: 5,
      borderWidth: 1,
      elevation: 100,
      height: 30,
      justifyContent: 'center',
      left: left,
      position: 'absolute',
      top: top,
      width: 30,
      zIndex: 100,
    },
  });

  return (
    <Pressable style={styles.buttonContainer} onPress={() => toggleTerrain()}>
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Path
          d="m1.754 13.406 4.453-4.851 3.09 3.09 3.281 3.277.969-.969-3.309-3.312 3.844-4.121 6.148 6.886h1.082v-.855l-7.207-8.07-4.84 5.187L6.169 6.57l-5.48 5.965v.871ZM.688 16.844h20.625v1.375H.688Zm0 0"
          fill={isTerrainActive ? COLOR.BLUE : COLOR.BLACK}
        />
      </Svg>
    </Pressable>
  );
});
