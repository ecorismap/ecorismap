import React from 'react';
import { COLOR, POLYGONTOOL } from '../../constants/AppConstants';
import { DrawToolType, PolygonToolType } from '../../types';

import { Button } from '../atoms';
import SelectionalLongPressButton from '../atoms/SelectionalLongPressButton';
import { t } from 'i18next';

interface Props {
  disabled?: boolean;
  isPositionRight: boolean;
  currentDrawTool: DrawToolType;
  currentPolygonTool: PolygonToolType;
  selectDrawTool: (value: DrawToolType) => void;
  setPolygonTool: React.Dispatch<React.SetStateAction<PolygonToolType>>;
}

export const HomePolygonToolButton = React.memo((props: Props) => {
  const { disabled, isPositionRight, currentDrawTool, currentPolygonTool, selectDrawTool, setPolygonTool } = props;

  return (
    <SelectionalLongPressButton
      selectedButton={currentPolygonTool}
      directionRow={'row'}
      isPositionRight={isPositionRight}
    >
      <Button
        id={'PLOT_POLYGON'}
        name={POLYGONTOOL.PLOT_POLYGON}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentDrawTool === 'PLOT_POLYGON' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setPolygonTool('PLOT_POLYGON');
          selectDrawTool('PLOT_POLYGON');
        }}
        labelText={t('Home.label.plotPolygon')}
      />
      <Button
        id={'FREEHAND_POLYGON'}
        name={POLYGONTOOL.FREEHAND_POLYGON}
        disabled={disabled}
        backgroundColor={
          disabled ? COLOR.ALFAGRAY : currentDrawTool === 'FREEHAND_POLYGON' ? COLOR.ALFARED : COLOR.ALFABLUE
        }
        borderRadius={10}
        onPressCustom={() => {
          setPolygonTool('FREEHAND_POLYGON');
          selectDrawTool('FREEHAND_POLYGON');
        }}
        labelText={t('Home.label.freehandPolygon')}
      />
    </SelectionalLongPressButton>
  );
});
