import React, { useState } from 'react';
import { COLOR } from '../../constants/AppConstants';
import { HISYOUTOOL } from './Constants';
import { LineToolType } from '../../types';
import { HisyouToolType } from './hisyoutool';

import { Button } from '../../components/atoms';
import SelectionalLongPressButton from '../../components/atoms/SelectionalLongPressButton';
import { useHisyouToolSetting } from './useHisyouToolSetting';
import { View } from 'react-native';

interface Props {
  isEditing: boolean;
  isSelected: boolean;
  isPositionRight: boolean;
  currentLineTool: LineToolType;
  selectLineTool: (value: LineToolType) => void;
}

export const HisyouToolButton = (props: Props) => {
  const { isEditing, isSelected, isPositionRight, currentLineTool, selectLineTool } = props;
  const { isHisyouToolActive } = useHisyouToolSetting();
  const [currentTool, setCurrentTool] = useState<HisyouToolType>(isHisyouToolActive ? 'HISYOU' : 'SETTING');

  return !isHisyouToolActive ? (
    <View>
      <Button
        id={'SETTING'}
        name={HISYOUTOOL.SETTING}
        disabled={isEditing}
        backgroundColor={isEditing ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
        borderRadius={10}
        onPress={() => {
          setCurrentTool('SETTING');
          selectLineTool('SETTING');
        }}
      />
    </View>
  ) : (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'HISYOU'}
        name={HISYOUTOOL.HISYOU}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentLineTool === 'HISYOU' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('HISYOU');
          selectLineTool('HISYOU');
        }}
      />
      <Button
        id={'SENKAI'}
        name={HISYOUTOOL.SENKAI}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentLineTool === 'SENKAI' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('SENKAI');
          selectLineTool('SENKAI');
        }}
      />
      <Button
        id={'SENJYOU'}
        name={HISYOUTOOL.SENJYOU}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentLineTool === 'SENJYOU' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('SENJYOU');
          selectLineTool('SENJYOU');
        }}
      />
      <Button
        id={'KOUGEKI'}
        name={HISYOUTOOL.KOUGEKI}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentLineTool === 'KOUGEKI' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('KOUGEKI');
          selectLineTool('KOUGEKI');
        }}
      />
      <Button
        id={'DISPLAY'}
        name={HISYOUTOOL.DISPLAY}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentLineTool === 'DISPLAY' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('DISPLAY');
          selectLineTool('DISPLAY');
        }}
      />
      <Button
        id={'HOVERING'}
        name={HISYOUTOOL.HOVERING}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentLineTool === 'HOVERING' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('HOVERING');
          selectLineTool('HOVERING');
        }}
      />
      <Button
        id={'KYUKOKA'}
        name={HISYOUTOOL.KYUKOKA}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentLineTool === 'KYUKOKA' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('KYUKOKA');
          selectLineTool('KYUKOKA');
        }}
      />
      <Button
        id={'KARI'}
        name={HISYOUTOOL.KARI}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentLineTool === 'KARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('KARI');
          selectLineTool('KARI');
        }}
      />
      <Button
        id={'TOMARI'}
        name={HISYOUTOOL.TOMARI}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentLineTool === 'TOMARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('TOMARI');
          selectLineTool('TOMARI');
        }}
      />
      <Button
        id={'SETTING'}
        name={HISYOUTOOL.SETTING}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('SETTING');
          selectLineTool('SETTING');
        }}
      />
    </SelectionalLongPressButton>
  );
};
