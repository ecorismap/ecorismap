import React, { useState } from 'react';
import { COLOR } from '../../constants/AppConstants';
import { HISYOUTOOL } from './Constants';
import { DrawToolType } from '../../types';
import { HisyouToolType } from './hisyoutool';

import { Button } from '../../components/atoms';
import SelectionalLongPressButton from '../../components/atoms/SelectionalLongPressButton';
import { useHisyouToolSetting } from './useHisyouToolSetting';
import { View } from 'react-native';

interface Props {
  isEditing: boolean;
  isSelected: boolean;
  isPositionRight: boolean;
  currentDrawTool: DrawToolType;
  selectDrawTool: (value: DrawToolType) => void;
}

export const HisyouToolButton = (props: Props) => {
  const { isEditing, isSelected, isPositionRight, currentDrawTool, selectDrawTool } = props;
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
          selectDrawTool('SETTING');
        }}
      />
    </View>
  ) : (
    <SelectionalLongPressButton selectedButton={currentTool} directionRow={'row'} isPositionRight={isPositionRight}>
      <Button
        id={'SETTING'}
        name={HISYOUTOOL.SETTING}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('SETTING');
          selectDrawTool('SETTING');
        }}
      />
      <Button
        id={'HISYOU'}
        name={HISYOUTOOL.HISYOU}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentDrawTool === 'HISYOU' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('HISYOU');
          selectDrawTool('HISYOU');
        }}
      />
      <Button
        id={'SENKAI'}
        name={HISYOUTOOL.SENKAI}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentDrawTool === 'SENKAI' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('SENKAI');
          selectDrawTool('SENKAI');
        }}
      />
      <Button
        id={'SENJYOU'}
        name={HISYOUTOOL.SENJYOU}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentDrawTool === 'SENJYOU' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('SENJYOU');
          selectDrawTool('SENJYOU');
        }}
      />
      <Button
        id={'KOUGEKI'}
        name={HISYOUTOOL.KOUGEKI}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentDrawTool === 'KOUGEKI' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('KOUGEKI');
          selectDrawTool('KOUGEKI');
        }}
      />
      <Button
        id={'DISPLAY'}
        name={HISYOUTOOL.DISPLAY}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentDrawTool === 'DISPLAY' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('DISPLAY');
          selectDrawTool('DISPLAY');
        }}
      />
      <Button
        id={'HOVERING'}
        name={HISYOUTOOL.HOVERING}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentDrawTool === 'HOVERING' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('HOVERING');
          selectDrawTool('HOVERING');
        }}
      />
      <Button
        id={'KYUKOKA'}
        name={HISYOUTOOL.KYUKOKA}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentDrawTool === 'KYUKOKA' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('KYUKOKA');
          selectDrawTool('KYUKOKA');
        }}
      />
      <Button
        id={'KARI'}
        name={HISYOUTOOL.KARI}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentDrawTool === 'KARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('KARI');
          selectDrawTool('KARI');
        }}
      />
      <Button
        id={'TOMARI'}
        name={HISYOUTOOL.TOMARI}
        disabled={isSelected}
        backgroundColor={isSelected ? COLOR.ALFAGRAY : currentDrawTool === 'TOMARI' ? COLOR.ALFARED : COLOR.ALFABLUE}
        borderRadius={10}
        onPressCustom={() => {
          setCurrentTool('TOMARI');
          selectDrawTool('TOMARI');
        }}
      />
    </SelectionalLongPressButton>
  );
};
