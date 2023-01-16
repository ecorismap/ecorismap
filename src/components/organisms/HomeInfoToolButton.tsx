import React, { useState } from 'react';
import { COLOR, DRAWTOOL } from '../../constants/AppConstants';
import { DrawToolType, InfoToolType } from '../../types';
import { isInfoTool } from '../../utils/General';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';

interface Props {
  isEditing: boolean;
  isPositionRight: boolean;
  currentDrawTool: DrawToolType;
  selectDrawTool: (value: DrawToolType) => void;
}

export const HomeInfoToolButton = (props: Props) => {
  const { isEditing, isPositionRight, currentDrawTool, selectDrawTool } = props;
  const [currentTool, setCurrentTool] = useState<InfoToolType>(
    isInfoTool(currentDrawTool) ? currentDrawTool : 'ALL_INFO'
  );

  return (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'ALL_INFO'}
        name={DRAWTOOL.ALL_INFO}
        backgroundColor={currentDrawTool === 'ALL_INFO' ? COLOR.ALFARED : isEditing ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
        borderRadius={10}
        disabled={isEditing}
        onPressCustom={() => {
          setCurrentTool('ALL_INFO');
          selectDrawTool('ALL_INFO');
        }}
      />
      <Button
        id={'FEATURETYPE_INFO'}
        name={DRAWTOOL.FEATURETYPE_INFO}
        backgroundColor={
          currentDrawTool === 'FEATURETYPE_INFO' ? COLOR.ALFARED : isEditing ? COLOR.ALFAGRAY : COLOR.ALFABLUE
        }
        borderRadius={10}
        disabled={isEditing}
        onPressCustom={() => {
          setCurrentTool('FEATURETYPE_INFO');
          selectDrawTool('FEATURETYPE_INFO');
        }}
      />
    </SelectionalLongPressButton>
  );
};
