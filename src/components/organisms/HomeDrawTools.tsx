import React, { useContext, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, DRAWTOOL, MAPMEMOTOOL, PLUGIN, POINTTOOL } from '../../constants/AppConstants';
import { HisyouToolButton } from '../../plugins/hisyoutool/HisyouToolButton';
import { useHisyouToolSetting } from '../../plugins/hisyoutool/useHisyouToolSetting';

import { Button } from '../atoms';
import { HomeLineToolButton } from './HomeLineToolButton';
import { HomePolygonToolButton } from './HomePolygonToolButton';
import { HomeContext } from '../../contexts/Home';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTablet } from 'react-native-device-info';
import { t } from '../../i18n/config';
import { useRoute } from '@react-navigation/native';

export const HomeDrawTools = () => {
  const {
    isEditingDraw,
    isEditingObject,
    isSelectedDraw,
    currentDrawTool,
    currentLineTool,
    currentPolygonTool,
    featureButton,
    isPencilModeActive,
    selectDrawTool,
    setLineTool,
    setPolygonTool,
    pressUndoDraw,
    pressSaveDraw,
    pressDeleteDraw,
    togglePencilMode,
    finishEditPosition,
  } = useContext(HomeContext);
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const { isHisyouToolActive } = useHisyouToolSetting();

  const editPosition = useMemo(() => {
    // @ts-ignore
    return route.params?.mode === 'editPosition';
    // @ts-ignore
  }, [route.params?.mode]);

  const editOldPosition = useMemo(() => {
    // @ts-ignore
    return editPosition && route.params?.jumpTo;
    // @ts-ignore
  }, [editPosition, route.params?.jumpTo]);

  const editNewPosition = useMemo(() => {
    // @ts-ignore
    return editPosition && !route.params?.jumpTo;
    // @ts-ignore
  }, [editPosition, route.params?.jumpTo]);

  const styles = StyleSheet.create({
    button: {
      alignSelf: 'flex-start',
      marginTop: 2,
      width: 36,
    },
    buttonContainer: {
      // elevation: 101,
      left: 9 + insets.left,
      marginHorizontal: 0,
      position: 'absolute',
      top: Platform.OS === 'ios' ? 360 : 330,
      // zIndex: 101,
    },
  });

  return (
    <View style={styles.buttonContainer}>
      <View>
        {featureButton === 'POINT' && (!editPosition || editNewPosition) && (
          <View style={styles.button}>
            <Button
              name={POINTTOOL.ADD_LOCATION_POINT}
              disabled={isEditingDraw || isSelectedDraw}
              backgroundColor={
                isEditingDraw || isSelectedDraw
                  ? COLOR.ALFAGRAY
                  : currentDrawTool === 'ADD_LOCATION_POINT'
                  ? COLOR.ALFARED
                  : COLOR.ALFABLUE
              }
              borderRadius={10}
              onPress={() => selectDrawTool('ADD_LOCATION_POINT')}
              tooltipText={t('Home.tooltip.addLocationPoint')}
              tooltipPosition={{ left: 1 }}
            />
          </View>
        )}

        {featureButton === 'POINT' && (!editPosition || editNewPosition) && (
          <View style={styles.button}>
            <Button
              id={'PLOT_POINT'}
              name={POINTTOOL.PLOT_POINT}
              backgroundColor={currentDrawTool === 'PLOT_POINT' ? COLOR.ALFARED : COLOR.ALFABLUE}
              borderRadius={10}
              onPress={() => selectDrawTool('PLOT_POINT')}
              tooltipText={t('Home.tooltip.plotPoint')}
              tooltipPosition={{ left: 1 }}
            />
          </View>
        )}
        {featureButton === 'POINT' && (!editPosition || editOldPosition) && (
          <View style={styles.button}>
            <Button
              name={DRAWTOOL.MOVE_POINT}
              backgroundColor={currentDrawTool === 'MOVE_POINT' ? COLOR.ALFARED : COLOR.ALFABLUE}
              borderRadius={10}
              disabled={false}
              onPress={() => selectDrawTool('MOVE_POINT')}
              tooltipText={t('Home.tooltip.movePoint')}
              tooltipPosition={{ left: 1 }}
            />
          </View>
        )}
        {featureButton === 'POINT' && (!editPosition || editOldPosition) && (
          <View style={styles.button}>
            <Button
              name={DRAWTOOL.DELETE_POINT}
              backgroundColor={
                currentDrawTool === 'DELETE_POINT' ? COLOR.ALFARED : isEditingDraw ? COLOR.ALFAGRAY : COLOR.ALFABLUE
              }
              borderRadius={10}
              disabled={isEditingDraw}
              onPress={() => selectDrawTool('DELETE_POINT')}
              tooltipText={t('Home.tooltip.deletePoint')}
              tooltipPosition={{ left: 1 }}
            />
          </View>
        )}

        {featureButton === 'POINT' && editPosition && (
          <View style={styles.button}>
            <Button
              name={DRAWTOOL.FINISH_EDIT_POSITION}
              backgroundColor={COLOR.ALFABLUE}
              borderRadius={10}
              onPress={finishEditPosition}
              tooltipText={t('Home.tooltip.finishEditPosition')}
              tooltipPosition={{ left: 1 }}
            />
          </View>
        )}
        {featureButton === 'LINE' && (
          <HomeLineToolButton
            disabled={isHisyouToolActive}
            isPositionRight={false}
            currentDrawTool={currentDrawTool}
            currentLineTool={currentLineTool}
            selectDrawTool={selectDrawTool}
            setLineTool={setLineTool}
          />
        )}
        {featureButton === 'POLYGON' && (
          <HomePolygonToolButton
            isPositionRight={false}
            currentDrawTool={currentDrawTool}
            currentPolygonTool={currentPolygonTool}
            selectDrawTool={selectDrawTool}
            setPolygonTool={setPolygonTool}
          />
        )}
      </View>
      {PLUGIN.HISYOUTOOL && featureButton === 'LINE' && (
        <View>
          <HisyouToolButton
            isEditing={isEditingDraw}
            isSelected={isSelectedDraw}
            isPositionRight={false}
            currentDrawTool={currentDrawTool}
            selectDrawTool={selectDrawTool}
          />
        </View>
      )}

      {featureButton !== 'POINT' && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.SELECT}
            backgroundColor={
              currentDrawTool === 'SELECT' ? COLOR.ALFARED : isEditingDraw ? COLOR.ALFAGRAY : COLOR.ALFABLUE
            }
            borderRadius={10}
            disabled={isEditingDraw}
            onPress={() => selectDrawTool('SELECT')}
          />
        </View>
      )}
      {featureButton !== 'POINT' && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.MOVE}
            backgroundColor={currentDrawTool === 'MOVE' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            disabled={false}
            onPress={() => selectDrawTool('MOVE')}
          />
        </View>
      )}
      {Platform.OS === 'ios' && isTablet() && (
        <View style={styles.button}>
          <Button
            name={MAPMEMOTOOL.PENCIL_LOCK}
            backgroundColor={isPencilModeActive ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPress={togglePencilMode}
          />
        </View>
      )}
      {featureButton !== 'POINT' && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.SAVE}
            backgroundColor={!isEditingDraw || isEditingObject ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
            borderRadius={10}
            disabled={!isEditingDraw || isEditingObject}
            onPress={pressSaveDraw}
          />
        </View>
      )}
      {featureButton !== 'POINT' && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.UNDO}
            backgroundColor={isEditingDraw ? COLOR.ALFABLUE : COLOR.ALFAGRAY}
            borderRadius={10}
            disabled={!isEditingDraw}
            onPress={pressUndoDraw}
          />
        </View>
      )}
      {featureButton !== 'POINT' && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.DELETE}
            backgroundColor={isEditingDraw || !isSelectedDraw ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
            borderRadius={10}
            disabled={isEditingDraw || !isSelectedDraw}
            onPress={pressDeleteDraw}
          />
        </View>
      )}
    </View>
  );
};
