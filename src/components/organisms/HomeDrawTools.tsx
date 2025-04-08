import React, { useContext, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { COLOR, DRAWTOOL, MAPMEMOTOOL, POINTTOOL } from '../../constants/AppConstants';

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
    isSelectedDraw,
    currentDrawTool,
    currentLineTool,
    currentPolygonTool,
    featureButton,
    isPencilModeActive,
    editPositionMode,
    selectDrawTool,
    setLineTool,
    setPolygonTool,
    pressUndoDraw,
    pressDeleteDraw,
    pressDeletePosition,
    togglePencilMode,
    finishEditPosition,
  } = useContext(HomeContext);
  const route = useRoute();
  const insets = useSafeAreaInsets();

  //座標がある場合
  const editPositionWithCoord = useMemo(() => {
    // @ts-ignore
    return editPositionMode && route.params?.withCoord;
    // @ts-ignore
  }, [editPositionMode, route.params?.withCoord]);

  //座標がない場合
  const editPositionWithoutCoord = useMemo(() => {
    // @ts-ignore
    return editPositionMode && !route.params?.withCoord;
    // @ts-ignore
  }, [editPositionMode, route.params?.withCoord]);

  const styles = StyleSheet.create({
    button: {
      alignSelf: 'flex-start',
      marginTop: 2,
      width: 40,
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
        {featureButton === 'POINT' && (!editPositionMode || editPositionWithoutCoord) && (
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
              labelText={t('Home.label.addLocationPoint')}
            />
          </View>
        )}

        {featureButton === 'POINT' && (!editPositionMode || editPositionWithoutCoord) && (
          <View style={styles.button}>
            <Button
              id={'PLOT_POINT'}
              name={POINTTOOL.PLOT_POINT}
              backgroundColor={currentDrawTool === 'PLOT_POINT' ? COLOR.ALFARED : COLOR.ALFABLUE}
              borderRadius={10}
              onPress={() => selectDrawTool('PLOT_POINT')}
              tooltipText={t('Home.tooltip.plotPoint')}
              tooltipPosition={{ left: 1 }}
              labelText={t('Home.label.plotPoint')}
            />
          </View>
        )}
        {featureButton === 'POINT' && (!editPositionMode || editPositionWithCoord) && (
          <View style={styles.button}>
            <Button
              name={DRAWTOOL.MOVE_POINT}
              backgroundColor={currentDrawTool === 'MOVE_POINT' ? COLOR.ALFARED : COLOR.ALFABLUE}
              borderRadius={10}
              disabled={false}
              onPress={() => selectDrawTool('MOVE_POINT')}
              tooltipText={t('Home.tooltip.movePoint')}
              tooltipPosition={{ left: 1 }}
              labelText={t('Home.label.movePoint')}
            />
          </View>
        )}
        {featureButton === 'POINT' && !editPositionMode && (
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
              labelText={t('Home.label.deletePoint')}
            />
          </View>
        )}

        {featureButton === 'LINE' && (
          <HomeLineToolButton
            disabled={false}
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

      {featureButton !== 'POINT' && !editPositionMode && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.SELECT}
            backgroundColor={
              currentDrawTool === 'SELECT' ? COLOR.ALFARED : isEditingDraw ? COLOR.ALFAGRAY : COLOR.ALFABLUE
            }
            borderRadius={10}
            disabled={isEditingDraw}
            onPress={() => selectDrawTool('SELECT')}
            labelText={t('Home.label.select')}
            labelFontSize={9}
          />
        </View>
      )}
      {featureButton !== 'POINT' && isEditingDraw && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.MOVE}
            backgroundColor={currentDrawTool === 'MOVE' ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            disabled={false}
            onPress={() => selectDrawTool('MOVE')}
            labelText={t('Home.label.move')}
            labelFontSize={9}
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
            labelText={t('Home.label.pencilLock')}
          />
        </View>
      )}
      {featureButton === 'POINT' && editPositionWithCoord && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.DELETE_POSITION}
            backgroundColor={COLOR.ALFABLUE}
            borderRadius={10}
            onPress={pressDeletePosition}
            tooltipText={t('Home.tooltip.deletePosition')}
            tooltipPosition={{ left: 1 }}
            labelText={t('Home.label.deletePosition')}
            labelFontSize={9}
          />
        </View>
      )}
      {featureButton !== 'POINT' && isEditingDraw && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.UNDO}
            backgroundColor={COLOR.ALFABLUE}
            borderRadius={10}
            disabled={false}
            onPress={pressUndoDraw}
            labelText={t('Home.label.undo')}
            labelFontSize={9}
          />
        </View>
      )}
      {featureButton !== 'POINT' && isEditingDraw && !editPositionMode && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.DELETE}
            backgroundColor={COLOR.ALFABLUE}
            borderRadius={10}
            disabled={false}
            onPress={pressDeleteDraw}
            labelText={t('Home.label.delete')}
          />
        </View>
      )}

      {featureButton === 'POINT' && editPositionMode && (
        <View style={styles.button}>
          <Button
            name={DRAWTOOL.FINISH_EDIT_POSITION}
            backgroundColor={COLOR.ALFABLUE}
            borderRadius={10}
            onPress={finishEditPosition}
            tooltipText={t('Home.tooltip.finishEditPosition')}
            tooltipPosition={{ left: 1 }}
            labelText={t('Home.label.finishEditPosition')}
          />
        </View>
      )}
    </View>
  );
};
