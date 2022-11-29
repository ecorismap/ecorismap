import { Position } from '@turf/turf';
import React from 'react';
import { PanResponderInstance, View } from 'react-native';
import Svg, { Defs, G, Marker, Path, TextPath, TSpan, Text as SVGText, Circle } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { v4 as uuidv4 } from 'uuid';
import { DrawLineToolType, RecordType } from '../../types';

interface Props {
  panResponder: PanResponderInstance;
  drawLine: {
    id: string;
    coords: Position[];
    properties: (DrawLineToolType | '')[];
    arrow: number;
  }[];
  modifiedLine: {
    start: Position;
    coords: Position[];
  };
  hisyouzuToolEnabled: boolean;
  selectedRecord: {
    layerId: string;
    record: RecordType | undefined;
  };
}
//React.Memoすると描画が更新されない
export const SvgLine = (props: Props) => {
  const { panResponder, drawLine, modifiedLine, hisyouzuToolEnabled, selectedRecord } = props;

  return (
    <View
      style={{
        zIndex: 1,
        elevation: 1,
        position: 'absolute',
        height: '100%',
        width: '100%',
      }}
      {...panResponder.panHandlers}
    >
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <Marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            //@ts-ignore
            markerUnits="strokeWidth"
            markerWidth="5"
            markerHeight="4"
            orient="auto"
          >
            <Path stroke="blue" strokeWidth="1" fill="blue" d="M 0 0 L 10 5 L 0 10 z" />
          </Marker>
          <Marker
            id="arrowSelected"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            //@ts-ignore
            markerUnits="strokeWidth"
            markerWidth="5"
            markerHeight="4"
            orient="auto"
          >
            <Path stroke="yellow" strokeWidth="1" fill="blue" d="M 0 0 L 10 5 L 0 10 z" />
          </Marker>
          <Marker
            id={'TOMARI'}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            //@ts-ignore
            markerUnits="strokeWidth"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <Circle cx="5" cy="5" r="5" fill="blue" stroke="white" />
          </Marker>
          <Marker
            id={'TOMARISelected'}
            viewBox="0 0 10 10"
            refX="5"
            refY="5"
            //@ts-ignore
            markerUnits="strokeWidth"
            markerWidth="4"
            markerHeight="4"
            orient="auto"
          >
            <Circle cx="5" cy="5" r="5" fill="blue" stroke="white" />
          </Marker>
        </Defs>

        {drawLine.map(({ id, coords, properties, arrow }, idx: number) => {
          const strokeColor = selectedRecord.record !== undefined && selectedRecord.record.id === id ? 'blue' : 'blue';
          const arrowStyle =
            hisyouzuToolEnabled &&
            arrow === 1 &&
            properties[0] !== 'TOMARI' &&
            selectedRecord.record !== undefined &&
            selectedRecord.record.id !== id
              ? 'url(#arrow)'
              : hisyouzuToolEnabled &&
                arrow === 1 &&
                properties[0] !== 'TOMARI' &&
                selectedRecord.record !== undefined &&
                selectedRecord.record.id === id
              ? 'url(#arrowSelected)'
              : '';
          const tomariStyle =
            properties[0] === 'TOMARI' && selectedRecord.record !== undefined && selectedRecord.record.id !== id
              ? `url(#${properties[0]})`
              : properties[0] === 'TOMARI' && selectedRecord.record !== undefined && selectedRecord.record.id === id
              ? `url(#${properties[0]}Selected)`
              : '';
          return (
            <G key={uuidv4()}>
              <Path
                id={`path${idx}`}
                d={pointsToSvg(coords)}
                stroke={strokeColor}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={properties[0] === 'DRAW' || properties.length === 0 ? '4,6' : '1'}
                fill="none"
                markerEnd={arrowStyle}
                markerStart={tomariStyle}
              />
              {properties.includes('SENKAI') && (
                <SVGText fontWeight={100} fontSize={18}>
                  <TextPath href={`#path${idx}`} startOffset="0%">
                    <TSpan fill={strokeColor}>{'○○○○○○○○○○○○○○○○○○○○'}</TSpan>
                  </TextPath>
                </SVGText>
              )}
              {properties.includes('SENJYOU') && (
                <SVGText fontWeight={100} fontSize={20}>
                  <TextPath href={`#path${idx}`} startOffset="0%">
                    <TSpan fill={strokeColor}>{'◎◎◎◎◎◎◎◎◎◎◎◎◎◎◎◎◎◎◎◎'}</TSpan>
                  </TextPath>
                </SVGText>
              )}
              {properties.includes('KOUGEKI') && (
                <SVGText fontWeight={100} fontSize={14}>
                  <TextPath href={`#path${idx}`} startOffset="0%">
                    <TSpan fill={strokeColor}>{'▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲'}</TSpan>
                  </TextPath>
                </SVGText>
              )}
              {properties.includes('DISPLAY') && (
                <SVGText fontWeight={300} fontSize={18}>
                  <TextPath href={`#path${idx}`} startOffset="0%">
                    <TSpan fill={strokeColor} dy="6">
                      {'WWWWWWWWWWWWWWWWWWWW'}
                    </TSpan>
                  </TextPath>
                </SVGText>
              )}
              {properties.includes('HOVERING') && (
                <SVGText fontWeight={100} fontSize={14}>
                  <TextPath href={`#path${idx}`} startOffset="0%">
                    <TSpan fill={strokeColor} dy="0" rotate={90}>
                      {'ⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽⒽ'}
                    </TSpan>
                  </TextPath>
                </SVGText>
              )}
              {properties.includes('KARI') && (
                <SVGText fontWeight={500} fontSize={14}>
                  <TextPath href={`#path${idx}`} startOffset="0%">
                    <TSpan fill={strokeColor} dy="5" rotate={0}>
                      {'XXXXXXXXXXXXXXXXXXXX'}
                    </TSpan>
                  </TextPath>
                </SVGText>
              )}
              {properties.includes('KYUKOKA') && (
                <SVGText fontWeight={800} fontSize={12}>
                  <TextPath href={`#path${idx}`} startOffset="0">
                    <TSpan fill={strokeColor} dx="10" dy="4" rotate={270}>
                      {'VVVVVVVVVVVVVVVVVVVVVVVVV'}
                    </TSpan>
                  </TextPath>
                </SVGText>
              )}
            </G>
          );
        })}

        <G>
          <Path
            d={pointsToSvg(modifiedLine.coords)}
            stroke="blue"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="1"
            fill="none"
            markerStart={modifiedLine.coords.length === 1 ? 'url(#TOMARI)' : ''}
          />
        </G>
      </Svg>
    </View>
  );
};
