import React, { useContext, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, DRAWTOOL } from '../../constants/AppConstants';
import { HomeContext } from '../../contexts/Home';
import { InfoToolType } from '../../types';
import { isInfoTool } from '../../utils/General';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

export const HomeInfoToolButton = () => {
  const { isEditingDraw, isSelectedDraw, currentDrawTool, selectDrawTool } = useContext(HomeContext);

  const [currentTool, setCurrentTool] = useState<InfoToolType>(
    isInfoTool(currentDrawTool) ? currentDrawTool : 'ALL_INFO'
  );

  return (
    <View style={styles.buttonContainer}>
      <View style={styles.selectionalButton}>
        <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={false}>
          <Button
            id={'ALL_INFO'}
            name={DRAWTOOL.ALL_INFO}
            backgroundColor={
              currentDrawTool === 'ALL_INFO'
                ? COLOR.ALFARED
                : isEditingDraw || isSelectedDraw
                ? COLOR.ALFAGRAY
                : COLOR.ALFABLUE
            }
            borderRadius={10}
            disabled={isEditingDraw || isSelectedDraw}
            onPressCustom={() => {
              setCurrentTool('ALL_INFO');
              selectDrawTool('ALL_INFO');
            }}
          />
          <Button
            id={'FEATURETYPE_INFO'}
            name={DRAWTOOL.FEATURETYPE_INFO}
            backgroundColor={
              currentDrawTool === 'FEATURETYPE_INFO'
                ? COLOR.ALFARED
                : isEditingDraw || isSelectedDraw
                ? COLOR.ALFAGRAY
                : COLOR.ALFABLUE
            }
            borderRadius={10}
            disabled={isEditingDraw || isSelectedDraw}
            onPressCustom={() => {
              setCurrentTool('FEATURETYPE_INFO');
              selectDrawTool('FEATURETYPE_INFO');
            }}
          />
        </SelectionalLongPressButton>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
    marginTop: 5,
  },
});
