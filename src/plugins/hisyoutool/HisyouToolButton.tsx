import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { HISYOUTOOL } from './Constants';
import { LineToolType } from '../../types';
import { HisyouToolType } from './hisyoutool';

import { Button } from '../../components/atoms';
import SelectionalLongPressButton from '../../components/atoms/SelectionalLongPressButton';

interface Props {
  isPositionRight: boolean;
  currentLineTool: LineToolType;
  selectLineTool: (value: LineToolType) => void;
}

export const HisyouToolButton = (props: Props) => {
  const { isPositionRight, currentLineTool, selectLineTool } = props;
  const [currentTool, setCurrentTool] = useState<HisyouToolType>('SENKAI');

  return (
    <View style={{ ...styles.button, width: undefined }}>
      <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
        <Button
          id={'SENKAI'}
          name={HISYOUTOOL.SENKAI}
          backgroundColor={currentLineTool === 'SENKAI' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPressCustom={() => {
            setCurrentTool('SENKAI');
            selectLineTool('SENKAI');
          }}
        />
        <Button
          id={'SENJYOU'}
          name={HISYOUTOOL.SENJYOU}
          backgroundColor={currentLineTool === 'SENJYOU' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPressCustom={() => {
            setCurrentTool('SENJYOU');
            selectLineTool('SENJYOU');
          }}
        />
        <Button
          id={'KOUGEKI'}
          name={HISYOUTOOL.KOUGEKI}
          backgroundColor={currentLineTool === 'KOUGEKI' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPressCustom={() => {
            setCurrentTool('KOUGEKI');
            selectLineTool('KOUGEKI');
          }}
        />
        <Button
          id={'DISPLAY'}
          name={HISYOUTOOL.DISPLAY}
          backgroundColor={currentLineTool === 'DISPLAY' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPressCustom={() => {
            setCurrentTool('DISPLAY');
            selectLineTool('DISPLAY');
          }}
        />
        <Button
          id={'HOVERING'}
          name={HISYOUTOOL.HOVERING}
          backgroundColor={currentLineTool === 'HOVERING' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPressCustom={() => {
            setCurrentTool('HOVERING');
            selectLineTool('HOVERING');
          }}
        />
        <Button
          id={'KOUGEKI'}
          name={HISYOUTOOL.KYUKOKA}
          backgroundColor={currentLineTool === 'KYUKOKA' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPressCustom={() => {
            setCurrentTool('KYUKOKA');
            selectLineTool('KYUKOKA');
          }}
        />
        <Button
          id={'KARI'}
          name={HISYOUTOOL.KARI}
          backgroundColor={currentLineTool === 'KARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPressCustom={() => {
            setCurrentTool('KARI');
            selectLineTool('KARI');
          }}
        />
        <Button
          id={'TOMARI'}
          name={HISYOUTOOL.TOMARI}
          backgroundColor={currentLineTool === 'TOMARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
          borderRadius={10}
          onPressCustom={() => {
            setCurrentTool('TOMARI');
            selectLineTool('TOMARI');
          }}
        />
      </SelectionalLongPressButton>
    </View>
  );
};
const styles = StyleSheet.create({
  button: {
    alignSelf: 'flex-start',
    marginTop: 5,
    width: 36,
  },
});
