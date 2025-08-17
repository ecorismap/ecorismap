import React, { useContext, useMemo } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { COLOR, DRAWTOOL, MAPMEMOTOOL, POINTTOOL } from '../../constants/AppConstants';

import { Button } from '../atoms';
import { HomeLineToolButton } from './HomeLineToolButton';
import { HomePolygonToolButton } from './HomePolygonToolButton';
import { MapMemoContext } from '../../contexts/MapMemo';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { LocationTrackingContext } from '../../contexts/LocationTracking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTablet } from 'react-native-device-info';
import { t } from '../../i18n/config';
import { useRoute } from '@react-navigation/native';

export const HomeDrawTools = React.memo(() => {
  const { isPencilModeActive, togglePencilMode } = useContext(MapMemoContext);
  const {
    isEditingDraw,
    isSelectedDraw,
    isEditingObject,
    currentDrawTool,
    currentLineTool,
    currentPolygonTool,
    featureButton,
    selectDrawTool,
    setLineTool,
    setPolygonTool,
    pressUndoDraw,
    pressDeleteDraw,
    finishEditObject,
    pressSaveDraw,
  } = useContext(DrawingToolsContext);
  const { editPositionMode, pressDeletePosition, finishEditPosition } = useContext(LocationTrackingContext);
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
      top: insets.top + 340,
      // zIndex: 101,
    },
    editControlContainer: {
      flexDirection: 'row',
      position: 'absolute',
      top: insets.top + 110,
      left: 0,
      right: 0,
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 20,
    },
    editButton: {
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 8,
      minWidth: 80,
    },
  });

  return (
    <>
      {/* 編集完了・キャンセルボタン */}
      {isEditingObject && (currentDrawTool === 'PLOT_LINE' || currentDrawTool === 'PLOT_POLYGON') && (
        <View style={styles.editControlContainer}>
          <Button
            name="check"
            backgroundColor={COLOR.BLUE}
            borderRadius={8}
            onPress={async () => {
              const finished = finishEditObject();
              if (finished) {
                await pressSaveDraw();
              }
            }}
            labelText={t('common.finish')}
            style={styles.editButton}
          />
          <Button
            name="close"
            backgroundColor={COLOR.RED}
            borderRadius={8}
            onPress={() => {
              selectDrawTool(currentDrawTool);  // addボタンを押した時と同じ処理（resetDrawToolsも内部で呼ばれる）
            }}
            labelText={t('common.cancel')}
            style={styles.editButton}
          />
        </View>
      )}

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
                currentDrawTool === 'SELECT' ? COLOR.ALFARED : (isEditingDraw || isEditingObject) ? COLOR.ALFAGRAY : COLOR.ALFABLUE
              }
              borderRadius={10}
              disabled={isEditingDraw || isEditingObject}
              onPress={() => selectDrawTool('SELECT')}
              labelText={t('Home.label.select')}
              labelFontSize={9}
            />
          </View>
        )}
        {featureButton !== 'POINT' && (isEditingDraw || isEditingObject) && (
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
              labelText={t('Home.label.deletePosition')}
              labelFontSize={9}
            />
          </View>
        )}
        {featureButton !== 'POINT' && (isEditingDraw || isEditingObject) && (
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
        {featureButton !== 'POINT' && (isEditingDraw || isEditingObject) && !editPositionMode && (
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
              labelText={t('Home.label.finishEditPosition')}
            />
          </View>
        )}
      </View>
    </>
  );
});
