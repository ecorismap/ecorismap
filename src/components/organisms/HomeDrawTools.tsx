import React, { useContext, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, DRAWTOOL, PLUGIN } from '../../constants/AppConstants';
import { HisyouToolButton } from '../../plugins/hisyoutool/HisyouToolButton';
import { useHisyouToolSetting } from '../../plugins/hisyoutool/useHisyouToolSetting';

import { Button } from '../atoms';
import { HomeLineToolButton } from './HomeLineToolButton';
import { HomeSelectionToolButton } from './HomeSelectionToolButton';
import { HomePolygonToolButton } from './HomePolygonToolButton';
import { HomePointToolButton } from './HomePointToolButton';
import { HomeInfoToolButton } from './HomeInfoToolButton';
import { useWindow } from '../../hooks/useWindow';
import { HomeContext } from '../../contexts/Home';

export const HomeDrawTools = () => {
  const {
    isDataOpened,
    isEditingLine,
    isEditingObject,
    currentDrawTool,
    currentPointTool,
    currentLineTool,
    currentPolygonTool,
    featureButton,
    drawLine,
    selectDrawTool,
    setPointTool,
    setLineTool,
    setPolygonTool,
    pressUndoDraw,
    pressSaveDraw,
    pressDeleteDraw,
  } = useContext(HomeContext);
  const { isLandscape } = useWindow();
  const isPositionRight = useMemo(() => isDataOpened === 'opened' || isLandscape, [isDataOpened, isLandscape]);
  const isSelected = useMemo(() => drawLine.length > 0 && drawLine[0].record !== undefined, [drawLine]);
  const { isHisyouToolActive } = useHisyouToolSetting();

  return (
    <View style={isPositionRight ? styles.buttonContainerRight : styles.buttonContainer}>
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        {featureButton === 'POINT' && (
          <HomePointToolButton
            isEditing={isEditingLine}
            isPositionRight={isPositionRight}
            currentPointTool={currentPointTool}
            currentDrawTool={currentDrawTool}
            selectDrawTool={selectDrawTool}
            setPointTool={setPointTool}
          />
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
            isEditing={isEditingLine}
            isSelected={isSelected}
            isPositionRight={isPositionRight}
            currentDrawTool={currentDrawTool}
            selectDrawTool={selectDrawTool}
          />
        </View>
      )}
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        <HomeInfoToolButton
          isEditing={isEditingLine}
          isPositionRight={isPositionRight}
          currentDrawTool={currentDrawTool}
          selectDrawTool={selectDrawTool}
        />
      </View>
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        <HomeSelectionToolButton
          isEditing={isEditingLine}
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
          backgroundColor={!isEditingLine || isEditingObject ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
          borderRadius={10}
          disabled={!isEditingLine || isEditingObject}
          onPress={pressSaveDraw}
        />
      </View>

      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={DRAWTOOL.UNDO}
          backgroundColor={isEditingLine ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isEditingLine}
          onPress={pressUndoDraw}
        />
      </View>

      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={DRAWTOOL.DELETE}
          backgroundColor={isEditingLine || isSelected ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!(isEditingLine || isSelected)}
          onPress={pressDeleteDraw}
        />
      </View>
    </View>
  );
};
const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    marginTop: 5,
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
    marginTop: 5,
    width: 36,
  },
  selectionalButton: {
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  selectionalButtonRight: {
    alignSelf: 'flex-end',
    marginTop: 5,
  },
});
