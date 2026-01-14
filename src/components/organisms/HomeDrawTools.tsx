import React, { useContext, useMemo } from 'react';
import { StyleSheet, View, Platform } from 'react-native';
import { COLOR, DRAWTOOL, MAPMEMOTOOL, POINTTOOL } from '../../constants/AppConstants';
import { isFreehandTool, isPlotTool } from '../../utils/General';

import { Button } from '../atoms';
import { HomeLineToolButton } from './HomeLineToolButton';
import { HomePolygonToolButton } from './HomePolygonToolButton';
import { MapMemoContext } from '../../contexts/MapMemo';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { LocationTrackingContext } from '../../contexts/LocationTracking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isTablet } from 'react-native-device-info';
import { t } from '../../i18n/config';
import { useRootRoute } from '../../contexts/RootNavigationContext';

export const HomeDrawTools = React.memo(() => {
  const { isPencilModeActive, togglePencilMode } = useContext(MapMemoContext);
  const {
    isEditingDraw,
    isSelectedDraw,
    isEditingObject,
    currentDrawTool,
    featureButton,
    selectDrawTool,
    setLineTool,
    setPolygonTool,
    pressUndoDraw,
    pressDeleteDraw,
    finishEditObject,
    pressSaveDraw,
  } = useContext(DrawingToolsContext);
  const { editPositionMode, finishEditPosition } = useContext(LocationTrackingContext);
  const { params } = useRootRoute<'Home'>();
  const insets = useSafeAreaInsets();

  //座標がない場合
  const editPositionWithoutCoord = useMemo(() => {
    return editPositionMode && !params?.withCoord;
  }, [editPositionMode, params?.withCoord]);

  //座標がある場合
  const editPositionWithCoord = useMemo(() => {
    return editPositionMode && params?.withCoord;
  }, [editPositionMode, params?.withCoord]);

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
      {isEditingObject && (isPlotTool(currentDrawTool) || isFreehandTool(currentDrawTool)) && (
        <View style={styles.editControlContainer}>
          <Button
            name="check"
            backgroundColor={COLOR.BLUE}
            borderRadius={8}
            onPress={async () => {
              const saved = await pressSaveDraw();
              if (saved) {
                finishEditObject();
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
          {featureButton === 'POINT' && (!editPositionMode || editPositionWithoutCoord) && !isSelectedDraw && !isEditingDraw && (
            <View style={styles.button}>
              <Button
                name={POINTTOOL.ADD_LOCATION_POINT}
                backgroundColor={COLOR.ALFABLUE}
                borderRadius={10}
                onPress={() => selectDrawTool('ADD_LOCATION_POINT')}
                labelText={t('Home.label.addLocationPoint')}
              />
            </View>
          )}
          {featureButton === 'POINT' && currentDrawTool === 'ADD_LOCATION_POINT' && isEditingDraw && (
            <View style={styles.button}>
              <Button
                name={POINTTOOL.ADD_LOCATION_POINT}
                backgroundColor={COLOR.ALFARED}
                borderRadius={10}
                onPress={() => selectDrawTool('ADD_LOCATION_POINT')}
                labelText={t('Home.label.addLocationPoint')}
              />
            </View>
          )}

          {featureButton === 'POINT' && (!editPositionMode || editPositionWithoutCoord) && !isSelectedDraw && (
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
          {featureButton === 'POINT' && (isSelectedDraw || editPositionWithCoord) && (
            <View style={styles.button}>
              <Button
                name={DRAWTOOL.MOVE_POINT}
                backgroundColor={currentDrawTool === 'MOVE' ? COLOR.ALFABLUE : COLOR.ALFARED}
                borderRadius={10}
                onPress={() => selectDrawTool('PLOT_POINT')}
                labelText={t('Home.label.movePoint')}
              />
            </View>
          )}
          {featureButton === 'LINE' && (
            <HomeLineToolButton
              disabled={false}
              currentDrawTool={currentDrawTool}
              isEditingDraw={isEditingDraw}
              selectDrawTool={selectDrawTool}
              setLineTool={setLineTool}
            />
          )}
          {featureButton === 'POLYGON' && (
            <HomePolygonToolButton
              disabled={false}
              currentDrawTool={currentDrawTool}
              selectDrawTool={selectDrawTool}
              setPolygonTool={setPolygonTool}
            />
          )}
        </View>

        {!editPositionMode && !isSelectedDraw && !isEditingDraw && (
          <View style={styles.button}>
            <Button
              name={DRAWTOOL.SELECT}
              backgroundColor={
                currentDrawTool === 'SELECT' ? COLOR.ALFARED : isEditingObject ? COLOR.ALFAGRAY : COLOR.ALFABLUE
              }
              borderRadius={10}
              disabled={isEditingObject}
              onPress={() => selectDrawTool('SELECT')}
              labelText={t('Home.label.select')}
              labelFontSize={9}
            />
          </View>
        )}
        {(isEditingDraw || isEditingObject) && (
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
              onPress={() => finishEditPosition()}
              labelText={t('Home.label.finishEditPosition')}
            />
          </View>
        )}
      </View>
    </>
  );
});
