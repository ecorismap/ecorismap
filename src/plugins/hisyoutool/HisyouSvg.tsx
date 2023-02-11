import React from 'react';

import { TextPath, TSpan, Text as SVGText } from 'react-native-svg';

interface HisyouSVGProps {
  id: number;
  properties: string[];
  strokeColor: string;
}

export const HisyouSVG = (props: HisyouSVGProps) => {
  const { id, properties, strokeColor } = props;
  return (
    <>
      {properties.includes('SENKAI') && (
        <SVGText fontWeight={100} fontSize={18}>
          <TextPath href={`#path${id}`} startOffset="0%">
            <TSpan fill={strokeColor}>{'○'.repeat(300)}</TSpan>
          </TextPath>
        </SVGText>
      )}

      {properties.includes('SENJYOU') && (
        <SVGText fontWeight={100} fontSize={18}>
          <TextPath href={`#path${id}`} startOffset="0%">
            <TSpan fill={strokeColor}>{'◎'.repeat(300)}</TSpan>
          </TextPath>
        </SVGText>
      )}
      {properties.includes('KOUGEKI') && (
        <SVGText fontWeight={100} fontSize={14}>
          <TextPath href={`#path${id}`} startOffset="0%">
            <TSpan fill={strokeColor}>{'▲'.repeat(300)}</TSpan>
          </TextPath>
        </SVGText>
      )}
      {properties.includes('DISPLAY') && (
        <SVGText fontWeight={300} fontSize={18}>
          <TextPath href={`#path${id}`} startOffset="0%">
            <TSpan fill={strokeColor} dy="6">
              {'W'.repeat(300)}
            </TSpan>
          </TextPath>
        </SVGText>
      )}
      {properties.includes('HOVERING') && (
        <SVGText fontWeight={100} fontSize={14}>
          <TextPath href={`#path${id}`} startOffset="0%">
            <TSpan fill={strokeColor} dy="0" rotate={90}>
              {'Ⓗ'.repeat(300)}
            </TSpan>
          </TextPath>
        </SVGText>
      )}
      {properties.includes('KARI') && (
        <SVGText fontWeight={500} fontSize={14}>
          <TextPath href={`#path${id}`} startOffset="0%">
            <TSpan fill={strokeColor} dy="5" rotate={0}>
              {'X'.repeat(300)}
            </TSpan>
          </TextPath>
        </SVGText>
      )}
      {properties.includes('KYUKOKA') && (
        <SVGText fontWeight={800} fontSize={12}>
          <TextPath href={`#path${id}`} startOffset="0">
            <TSpan fill={strokeColor} dx="10" dy="4" rotate={270}>
              {'V'.repeat(300)}
            </TSpan>
          </TextPath>
        </SVGText>
      )}
    </>
  );
};
