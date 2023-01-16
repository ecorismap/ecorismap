import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, POINTTOOL } from '../../constants/AppConstants';
import { PointToolType } from '../../types';

import { Button } from '../atoms';

interface Props {
  isPositionRight: boolean;
  pointTool: PointToolType;
  selectPointTool: (value: PointToolType) => void;
}

export const HomePointTools = (props: Props) => {
  const { isPositionRight, pointTool, selectPointTool } = props;
  //console.log('HomeButton');

  return (
    <View style={isPositionRight ? styles.buttonContainerRight : styles.buttonContainer}>
      <View style={{ marginTop: 5 }}>
        <Button
          name={POINTTOOL.ADD_LOCATION}
          backgroundColor={pointTool === 'ADD_LOCATION' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => selectPointTool('ADD_LOCATION')}
        />
      </View>
      <View style={{ marginTop: 5 }}>
        <Button
          name={POINTTOOL.ADD}
          backgroundColor={pointTool === 'ADD' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => selectPointTool('ADD')}
        />
      </View>

      <View style={{ marginTop: 5 }}>
        <Button
          name={POINTTOOL.MOVE}
          backgroundColor={pointTool === 'MOVE' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPress={() => selectPointTool('MOVE')}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  buttonContainer: {
    left: 9,
    marginHorizontal: 0,
    position: 'absolute',
    top: Platform.OS === 'ios' ? 280 : 250,
    zIndex: 101,
  },
  buttonContainerRight: {
    elevation: 101,
    marginHorizontal: 0,
    position: 'absolute',
    right: 10,
    top: Platform.OS === 'ios' ? 40 : 10,
    zIndex: 101,
  },
});
