import React, { useState } from 'react';
import { COLOR, DRAWTOOL } from '../../constants/AppConstants';
import { DrawToolType, SelectionToolType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  isEditing: boolean;
  isPositionRight: boolean;
  currentDrawTool: DrawToolType;
  selectLineTool: (value: DrawToolType) => void;
}

export const HomeSelectionToolButton = (props: Props) => {
  const { isEditing, isPositionRight, currentDrawTool, selectLineTool } = props;
  const [currentTool, setCurrentTool] = useState<SelectionToolType>('INFO');

  return (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'INFO'}
        name={DRAWTOOL.INFO}
        backgroundColor={currentDrawTool === 'INFO' ? COLOR.ALFARED : isEditing ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
        borderRadius={10}
        disabled={isEditing}
        onPressCustom={() => {
          setCurrentTool('INFO');
          selectLineTool('INFO');
        }}
      />
      <Button
        id={'SELECT'}
        name={DRAWTOOL.SELECT}
        backgroundColor={currentDrawTool === 'SELECT' ? COLOR.ALFARED : isEditing ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
        borderRadius={10}
        disabled={isEditing}
        onPressCustom={() => {
          setCurrentTool('SELECT');
          selectLineTool('SELECT');
        }}
      />
    </SelectionalLongPressButton>
  );
};
