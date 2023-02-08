import React, { useContext } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, POINTTOOL } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { HomeContext } from '../../contexts/Home';
import { HomeInfoToolButton } from './HomeInfoToolButton';

export const HomeCommonTools = () => {
  const { isEditingDraw, isSelectedDraw, currentDrawTool, selectDrawTool } = useContext(HomeContext);

  return (
    <View style={styles.buttonContainer}>
      <View style={styles.selectionalButton}>
        <View style={styles.button}>
          <Button
            id={'ADD_LOCATION_POINT'}
            name={POINTTOOL.ADD_LOCATION_POINT}
            disabled={isEditingDraw || isSelectedDraw}
            backgroundColor={
              isEditingDraw || isSelectedDraw
                ? COLOR.ALFAGRAY
                : currentDrawTool === 'ADD_LOCATION_POINT'
                ? COLOR.ALFARED
                : COLOR.ALFABLUE
            }
            borderRadius={10}
            onPress={() => selectDrawTool('ADD_LOCATION_POINT')}
          />
        </View>

        <HomeInfoToolButton
          disabled={isEditingDraw || isSelectedDraw}
          isPositionRight={false}
          currentDrawTool={currentDrawTool}
          selectDrawTool={selectDrawTool}
        />
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    marginBottom: 5,
    marginTop: 2,
    width: 36,
  },
  buttonContainer: {
    elevation: 101,
    left: 9,
    marginHorizontal: 0,
    position: 'absolute',
    top: Platform.OS === 'ios' ? 260 : 230,
    zIndex: 101,
  },

  selectionalButton: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
});
