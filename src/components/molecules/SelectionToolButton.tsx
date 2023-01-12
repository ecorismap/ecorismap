import React, { useState } from 'react';
import { COLOR, LINETOOL } from '../../constants/AppConstants';
import { LineToolType, SelectionToolType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  isEditing: boolean;
  isPositionRight: boolean;
  currentLineTool: LineToolType;
  selectLineTool: (value: LineToolType) => void;
}

export const SelectionToolButton = (props: Props) => {
  const { isEditing, isPositionRight, currentLineTool, selectLineTool } = props;
  const [currentTool, setCurrentTool] = useState<SelectionToolType>('INFO');

  return (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'INFO'}
        name={LINETOOL.INFO}
        backgroundColor={currentLineTool === 'INFO' ? COLOR.ALFARED : isEditing ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
        borderRadius={10}
        disabled={isEditing}
        onPressCustom={() => {
          setCurrentTool('INFO');
          selectLineTool('INFO');
        }}
      />
      <Button
        id={'SELECT'}
        name={LINETOOL.SELECT}
        backgroundColor={currentLineTool === 'SELECT' ? COLOR.ALFARED : isEditing ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
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
