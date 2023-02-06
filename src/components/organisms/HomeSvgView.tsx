import React, { useContext, useMemo } from 'react';
import {
  GestureResponderEvent,
  PanResponder,
  PanResponderGestureState,
  PanResponderInstance,
  View,
} from 'react-native';

import Svg, { G, Defs, Marker, Path, Circle, Rect } from 'react-native-svg';
import { pointsToSvg } from '../../utils/Coords';
import { v4 as uuidv4 } from 'uuid';
import { COLOR } from '../../constants/AppConstants';
import { HisyouSVG } from '../../plugins/hisyoutool/HisyouSvg';
import { isPlotTool, isPolygonTool } from '../../utils/General';
import { useHisyouToolSetting } from '../../plugins/hisyoutool/useHisyouToolSetting';
import { HomeContext } from '../../contexts/Home';

//React.Memoすると描画が更新されない
export const SvgView = () => {
  const {
    drawLine,
    editingLine,
    selectLine,
    currentDrawTool,
    isEditingObject,
    onPressSvgView,
    onMoveSvgView,
    onReleaseSvgView,
  } = useContext(HomeContext);
  const { isHisyouToolActive } = useHisyouToolSetting();

  const panResponder: PanResponderInstance = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          onPressSvgView(e, gestureState);
        },
        onPanResponderMove: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          onMoveSvgView(e, gestureState);
        },
        onPanResponderRelease: (e: GestureResponderEvent, gestureState: PanResponderGestureState) => {
          onReleaseSvgView(e, gestureState);
        },
      }),
    [onMoveSvgView, onPressSvgView, onReleaseSvgView]
  );

  const editingStartStyle = '';
  const editingMidStyle = '';
  const editingEndStyle = '';

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
        <LineDefs />
        {drawLine.map(({ xy, properties }, idx: number) => {
          let startStyle =
            currentDrawTool === 'SELECT' || currentDrawTool === 'MOVE'
              ? ''
              : properties.includes('EDIT')
              ? `url(#add)`
              : isEditingObject
              ? ''
              : `url(#delete)`;
          let midStyle =
            currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON'
              ? properties.includes('EDIT')
                ? `url(#plot)`
                : ''
              : '';
          let endStyle = properties.includes('POINT') ? `url(#point)` : properties.includes('EDIT') ? `url(#last)` : '';
          if (isHisyouToolActive) {
            startStyle = !properties.includes('HISYOU')
              ? ''
              : properties.includes('EDIT')
              ? `url(#add)`
              : isEditingObject
              ? ''
              : `url(#delete)`;
            midStyle = '';
            endStyle = properties.includes('arrow') ? 'url(#arrow)' : properties.includes('TOMARI') ? `url(#dot)` : '';
          }

          return (
            <G key={uuidv4()}>
              {properties.includes('EDIT') && (
                <Path id={`path${idx}`} d={pointsToSvg(xy)} stroke={'blue'} strokeWidth="4" />
              )}
              <Path
                id={`path${idx}`}
                d={pointsToSvg(xy)}
                stroke={properties.includes('EDIT') ? 'lightblue' : 'blue'}
                strokeWidth="2"
                strokeDasharray={'none'}
                fill={
                  isPolygonTool(currentDrawTool)
                    ? properties.includes('EDIT')
                      ? COLOR.ALFAYELLOW
                      : COLOR.ALFABLUE2
                    : 'none'
                }
                markerStart={startStyle}
                markerMid={midStyle}
                markerEnd={endStyle}
              />

              {isHisyouToolActive && <HisyouSVG id={idx} properties={properties} strokeColor={'blue'} />}
            </G>
          );
        })}
        {/* 修正のライン */}
        {!isPlotTool(currentDrawTool) && (
          <G>
            <Path
              d={pointsToSvg(editingLine)}
              stroke="blue"
              strokeWidth="2.5"
              strokeDasharray="2,3"
              fill="none"
              markerStart={editingStartStyle}
              markerMid={editingMidStyle}
              markerEnd={editingEndStyle}
            />
          </G>
        )}
        {/* 選択範囲のライン */}
        <G>
          <Path
            d={pointsToSvg(selectLine)}
            stroke={`${COLOR.YELLOW}`}
            strokeWidth="2"
            strokeDasharray="1"
            fill={`${COLOR.ALFAYELLOW}`}
          />
        </G>
      </Svg>
    </View>
  );
};

const LineDefs = () => {
  return (
    <Defs>
      <G id="markers">
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
          id="dot"
          viewBox="0 0 10 10"
          refX="5"
          refY="7"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth="4"
          markerHeight="4"
          orient="auto"
        >
          <Circle cx="5" cy="5" r="5" fill="blue" stroke="white" />
        </Marker>
        <Marker
          id="point"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth="4"
          markerHeight="4"
          orient="0"
        >
          <Circle cx="5" cy="5" r="10" fill="yellow" stroke="black" />
        </Marker>

        <Marker
          id="add"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth="5"
          markerHeight="5"
          orient="0"
        >
          <Circle cx="5" cy="5" r="10" fill={COLOR.ALFABLUE} stroke={COLOR.WHITE} />
          <Rect x="0.25" y="3.75" width="10" height="3" fill={COLOR.WHITE} stroke={COLOR.WHITE} />
          <Rect x="3.75" y="0.25" width="3" height="10" fill={COLOR.WHITE} stroke={COLOR.WHITE} />
        </Marker>
        <Marker
          id="delete"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth="4"
          markerHeight="4"
          orient="0"
        >
          <Circle cx="5" cy="5" r="10" fill={COLOR.ALFAGRAY} stroke={COLOR.ALFAWHITE} />
          <Path stroke={COLOR.ALFAWHITE} strokeWidth="3" d="M 0 0 L 10 10 z" />
          <Path stroke={COLOR.ALFAWHITE} strokeWidth="3" d="M 0 10 L 10 0 z" />
        </Marker>

        <Marker
          id="plot"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth="6"
          markerHeight="6"
          orient="0"
        >
          <Circle cx="5" cy="5" r="3.5" fill="white" stroke="blue" strokeWidth="2" />
        </Marker>
        <Marker
          id="last"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          //@ts-ignore
          markerUnits="strokeWidth"
          markerWidth="3"
          markerHeight="3"
          orient="0"
        >
          <Rect width="10" height="10" fill="white" stroke="blue" strokeWidth="1" />
        </Marker>
      </G>
    </Defs>
  );
};
