import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, DRAWTOOL, PLUGIN } from '../../constants/AppConstants';
import { HisyouToolButton } from '../../plugins/hisyoutool/HisyouToolButton';
import { useHisyouToolSetting } from '../../plugins/hisyoutool/useHisyouToolSetting';
import { DrawToolType, FeatureButtonType, LineToolType, PointToolType, PolygonToolType } from '../../types';

import { Button } from '../atoms';
import { HomeLineToolButton } from './HomeLineToolButton';
import { HomeSelectionToolButton } from './HomeSelectionToolButton';
import { HomePolygonToolButton } from './HomePolygonToolButton';
import { HomePointToolButton } from './HomePointToolButton';
import { HomeInfoToolButton } from './HomeInfoToolButton';

interface Props {
  isPositionRight: boolean;
  isEditing: boolean;
  isSelected: boolean;
  currentDrawTool: DrawToolType;
  currentPointTool: PointToolType;
  currentLineTool: LineToolType;
  currentPolygonTool: PolygonToolType;
  featureButton: FeatureButtonType;
  selectDrawTool: (value: DrawToolType) => void;
  setPointTool: React.Dispatch<React.SetStateAction<PointToolType>>;
  setLineTool: React.Dispatch<React.SetStateAction<LineToolType>>;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
  pressUndoDraw: () => void;
  pressSaveDraw: () => void;
  pressDeleteDraw: () => void;
}

export const HomeDrawTools = (props: Props) => {
  const {
    isPositionRight,
    isSelected,
    isEditing,
    currentDrawTool,
    currentPointTool,
    currentLineTool,
    currentPolygonTool,
    featureButton,
    selectDrawTool,
    setPointTool,
    setLineTool,
    setPolygonTool,
    pressUndoDraw,
    pressSaveDraw,
    pressDeleteDraw,
  } = props;
  const { isHisyouToolActive } = useHisyouToolSetting();

  return (
    <View style={isPositionRight ? styles.buttonContainerRight : styles.buttonContainer}>
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        {featureButton === 'POINT' && (
          <HomePointToolButton
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
            isEditing={isEditing}
            isSelected={isSelected}
            isPositionRight={isPositionRight}
            currentDrawTool={currentDrawTool}
            selectDrawTool={selectDrawTool}
          />
        </View>
      )}
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        <HomeInfoToolButton
          isEditing={isEditing}
          isPositionRight={isPositionRight}
          currentDrawTool={currentDrawTool}
          selectDrawTool={selectDrawTool}
        />
      </View>
      <View style={isPositionRight ? styles.selectionalButtonRight : styles.selectionalButton}>
        <HomeSelectionToolButton
          isEditing={isEditing}
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
          backgroundColor={isEditing ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isEditing}
          onPress={pressSaveDraw}
        />
      </View>

      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={DRAWTOOL.UNDO}
          backgroundColor={isEditing ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!isEditing}
          onPress={pressUndoDraw}
        />
      </View>

      <View style={isPositionRight ? styles.buttonRight : styles.button}>
        <Button
          name={DRAWTOOL.DELETE}
          backgroundColor={isEditing || isSelected ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
          borderRadius={10}
          disabled={!(isEditing || isSelected)}
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
