import React, { useContext, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, DRAWTOOL, PLUGIN, POINTTOOL } from '../../constants/AppConstants';
import { HisyouToolButton } from '../../plugins/hisyoutool/HisyouToolButton';
import { useHisyouToolSetting } from '../../plugins/hisyoutool/useHisyouToolSetting';

import { Button } from '../atoms';
import { HomeLineToolButton } from './HomeLineToolButton';
import { HomeSelectionToolButton } from './HomeSelectionToolButton';
import { HomePolygonToolButton } from './HomePolygonToolButton';
import { useWindow } from '../../hooks/useWindow';
import { HomeContext } from '../../contexts/Home';

export const HomeDrawTools = () => {
  const {
    isDataOpened,
    isEditingDraw,
    isEditingObject,
    isSelectedDraw,
    currentDrawTool,
    currentLineTool,
    currentPolygonTool,
    featureButton,
    selectDrawTool,
    setLineTool,
    setPolygonTool,
    pressUndoDraw,
    pressSaveDraw,
    pressDeleteDraw,
  } = useContext(HomeContext);
  const { isLandscape } = useWindow();
  const isPositionRight = useMemo(
    () => isDataOpened === 'opened' || (isLandscape && Platform.OS !== 'web'),
    [isDataOpened, isLandscape]
  );

  const { isHisyouToolActive } = useHisyouToolSetting();

  return (
    <View style={isPositionRight ? styles.buttonContainerRight : styles.buttonContainer}>
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        {featureButton === 'POINT' && (
          <View style={isPositionRight ? styles.buttonRight : styles.button}>
            <Button
              id={'PLOT_POINT'}
              name={POINTTOOL.PLOT_POINT}
              backgroundColor={currentDrawTool === 'PLOT_POINT' ? COLOR.ALFARED : COLOR.ALFABLUE}
              borderRadius={10}
              onPress={() => selectDrawTool('PLOT_POINT')}
            />
          </View>
        )}
        {featureButton === 'LINE' && (
          <HomeLineToolButton
            disabled={isHisyouToolActive}
            isPositionRight={isPositionRight}
            currentDrawTool={currentDrawTool}
            currentLineTool={currentLineTool}
            selectDrawTool={selectDrawTool}
            setLineTool={setLineTool}
          />
        )}
        {featureButton === 'POLYGON' && (
          <HomePolygonToolButton
            isPositionRight={isPositionRight}
            currentDrawTool={currentDrawTool}
            currentPolygonTool={currentPolygonTool}
            selectDrawTool={selectDrawTool}
            setPolygonTool={setPolygonTool}
          />
        )}
      </View>
      {PLUGIN.HISYOUTOOL && featureButton === 'LINE' && (
        <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
          <HisyouToolButton
            isEditing={isEditingDraw}
            isSelected={isSelectedDraw}
            isPositionRight={isPositionRight}
            currentDrawTool={currentDrawTool}
            selectDrawTool={selectDrawTool}
          />
        </View>
      )}

      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        <HomeSelectionToolButton
          isEditing={isEditingDraw}
          isPositionRight={isPositionRight}
          currentDrawTool={currentDrawTool}
          selectDrawTool={selectDrawTool}
        />
      </View>
      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={DRAWTOOL.MOVE}
          backgroundColor={currentDrawTool === 'MOVE' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          disabled={false}
          onPress={() => selectDrawTool('MOVE')}
        />
      </View>

      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={DRAWTOOL.SAVE}
          backgroundColor={!isEditingDraw || isEditingObject ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
          borderRadius={10}
          disabled={!isEditingDraw || isEditingObject}
          onPress={pressSaveDraw}
        />
      </View>

      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={DRAWTOOL.UNDO}
          backgroundColor={isEditingDraw ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isEditingDraw}
          onPress={pressUndoDraw}
        />
      </View>

      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={DRAWTOOL.DELETE}
          backgroundColor={isEditingDraw || !isSelectedDraw ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
          borderRadius={10}
          disabled={isEditingDraw || !isSelectedDraw}
          onPress={pressDeleteDraw}
        />
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    marginTop: 2,
    width: 36,
  },
  buttonContainer: {
    elevation: 101,
    left: 9,
    marginHorizontal: 0,
    position: 'absolute',
    top: Platform.OS === 'ios' ? 360 : 330,
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
  buttonRight: {
    alignSelf: 'flex-end',
    marginTop: 2,
    width: 36,
  },
  selectionalButton: {
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  selectionalButtonRight: {
    alignSelf: 'flex-end',
    marginTop: 2,
  },
});
