import React, { useState } from 'react';
import { COLOR, DRAWTOOL } from '../../constants/AppConstants';
import { DrawToolType, SelectionToolType } from '../../types';
import { isSelectionTool } from '../../utils/General';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  isEditing: boolean;
  isPositionRight: boolean;
  currentDrawTool: DrawToolType;
  selectDrawTool: (value: DrawToolType) => void;
}

export const HomeSelectionToolButton = (props: Props) => {
  const { isEditing, isPositionRight, currentDrawTool, selectDrawTool } = props;
  const [currentTool, setCurrentTool] = useState<SelectionToolType>(
    isSelectionTool(currentDrawTool) ? currentDrawTool : 'SELECT'
  );

  return (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'SELECT'}
        name={DRAWTOOL.SELECT}
        backgroundColor={currentDrawTool === 'SELECT' ? COLOR.ALFARED : isEditing ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
        borderRadius={10}
        disabled={isEditing}
        onPressCustom={() => {
          setCurrentTool('SELECT');
          selectDrawTool('SELECT');
        }}
      />
    </SelectionalLongPressButton>
  );
};
