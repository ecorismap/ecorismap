import React, { useContext, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { COLOR, DRAWTOOL, POINTTOOL } from '../../constants/AppConstants';

import { Button } from '../atoms';
import { HomeLineToolButton } from './HomeLineToolButton';
import { HomePolygonToolButton } from './HomePolygonToolButton';
import { HomeEditControlButtons } from './HomeEditControlButtons';
import { HomeEditingLayerButton } from './HomeEditingLayerButton';
import {
  DeleteToolButton,
  MoveToolButton,
  PencilLockButton,
  RedoToolButton,
  SelectToolButton,
  UndoToolButton,
} from './HomeCommonToolButtons';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { LocationTrackingContext } from '../../contexts/LocationTracking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../i18n/config';
import { useRootRoute } from '../../contexts/RootNavigationContext';

export const HomeDrawTools = React.memo(() => {
  const {
    isEditingDraw,
    isSelectedDraw,
    isEditingObject,
    currentDrawTool,
    featureButton,
    selectDrawTool,
    setLineTool,
    setPolygonTool,
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
  });

  return (
    <>
      {/* 編集完了・キャンセルボタン */}
      <HomeEditControlButtons />

      {/* 編集レイヤ名の表示・切替チップ */}
      <HomeEditingLayerButton />

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

        {!editPositionMode && !isSelectedDraw && !isEditingDraw && <SelectToolButton disabled={isEditingObject} />}
        {(isEditingDraw || isEditingObject) && <MoveToolButton />}
        <PencilLockButton />
        {(isEditingDraw || isEditingObject) && <UndoToolButton />}
        {(isEditingDraw || isEditingObject) && <RedoToolButton />}
        {/* ポイントは選択中（編集選択）のみ削除可。新規作図中の表示は避ける（ライン・ポリゴンは従来どおり） */}
        {(featureButton === 'POINT' ? isSelectedDraw : isEditingDraw || isEditingObject) && !editPositionMode && (
          <DeleteToolButton />
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
