import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BRUSH, COLOR, DRAWTOOL, MAPMEMOTOOL, PEN_WIDTH, POINTTOOL, STAMP } from '../../constants/AppConstants';

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
import { MapMemoContext } from '../../contexts/MapMemo';
import { LocationTrackingContext } from '../../contexts/LocationTracking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../../i18n/config';
import { useRootRoute } from '../../contexts/RootNavigationContext';
import { isBrushTool, isStampTool } from '../../utils/General';
import { HandwritingSubToolType, PenWidthType } from '../../types';

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
    isIndividualStyleLayer,
    selectedObjectWidthType,
    handwritingSubTool,
    setHandwritingSubTool,
    openHandwritingSettingsTab,
  } = useContext(DrawingToolsContext);
  const { setVisibleMapMemoColor, currentPenWidth, setPenWidth } = useContext(MapMemoContext);

  //手書きポリゴン用の太さ選択（タップで細/中/太を横展開して選ぶ）
  const [isWidthPaletteOpen, setWidthPaletteOpen] = useState(false);
  const selectPenWidth = (width: PenWidthType) => {
    setPenWidth(width);
    setWidthPaletteOpen(false);
  };
  const widthLabel = (width: PenWidthType) =>
    width === 'PEN_THIN'
      ? t('Home.penPicker.thin')
      : width === 'PEN_THICK'
      ? t('Home.penPicker.thick')
      : t('Home.penPicker.medium');

  //手書きペンで最後に使ったスタンプ・ブラシ種別（ボタン再タップで復元。初回は設定を開く）
  const lastHandwritingTool = useRef<{ STAMP?: HandwritingSubToolType; BRUSH?: HandwritingSubToolType }>({});
  useEffect(() => {
    if (isStampTool(handwritingSubTool)) lastHandwritingTool.current.STAMP = handwritingSubTool;
    else if (isBrushTool(handwritingSubTool)) lastHandwritingTool.current.BRUSH = handwritingSubTool;
  }, [handwritingSubTool]);

  //サブツール選択: 選択中グループの再タップは設定モーダルを開き、未選択グループは前回種別を復元する
  const pressHandwritingPen = () => {
    if (handwritingSubTool === 'PEN') {
      openHandwritingSettingsTab('PEN');
    } else {
      setHandwritingSubTool('PEN');
    }
  };
  const pressHandwritingStamp = () => {
    if (isStampTool(handwritingSubTool)) {
      openHandwritingSettingsTab('STAMP');
      return;
    }
    const last = lastHandwritingTool.current.STAMP;
    if (last !== undefined) setHandwritingSubTool(last);
    else openHandwritingSettingsTab('STAMP');
  };
  const pressHandwritingBrush = () => {
    if (isBrushTool(handwritingSubTool)) {
      openHandwritingSettingsTab('BRUSH');
      return;
    }
    const last = lastHandwritingTool.current.BRUSH;
    if (last !== undefined) setHandwritingSubTool(last);
    else openHandwritingSettingsTab('BRUSH');
  };
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
      //太さパレット展開で列が広がっても各ボタンが左端に留まるようにする
      alignItems: 'flex-start',
      // elevation: 101,
      left: 9 + insets.left,
      marginHorizontal: 0,
      position: 'absolute',
      top: insets.top + 340,
      // zIndex: 101,
    },
    toolColumn: {
      //子（ツールボタン群）がストレッチして中身が横ずれしないようにする
      alignItems: 'flex-start',
    },
    widthPaletteButton: {
      marginRight: 5,
      width: 40,
    },
    widthPaletteRow: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      marginTop: 2,
    },
  });

  return (
    <>
      {/* 編集完了・キャンセルボタン */}
      <HomeEditControlButtons />

      {/* 編集レイヤ名の表示・切替チップ */}
      <HomeEditingLayerButton />

      <View style={styles.buttonContainer}>
        <View style={styles.toolColumn}>
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

          {/* LINE手書き選択中のサブツール（ペン/スタンプ/ブラシ） */}
          {currentDrawTool === 'HANDWRITING_LINE' && (
            <>
              <View style={styles.button}>
                <Button
                  name={MAPMEMOTOOL.PEN}
                  backgroundColor={handwritingSubTool === 'PEN' ? COLOR.ALFARED : COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={pressHandwritingPen}
                  labelText={t('Home.label.pen')}
                />
              </View>
              <View style={styles.button}>
                <Button
                  // @ts-ignore
                  name={STAMP[handwritingSubTool] || STAMP.STAMP}
                  backgroundColor={isStampTool(handwritingSubTool) ? COLOR.ALFARED : COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={pressHandwritingStamp}
                  labelText={t('Home.label.stamp')}
                  labelFontSize={9}
                />
              </View>
              <View style={styles.button}>
                <Button
                  // @ts-ignore
                  name={BRUSH[handwritingSubTool] || BRUSH.BRUSH}
                  backgroundColor={isBrushTool(handwritingSubTool) ? COLOR.ALFARED : COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={pressHandwritingBrush}
                  labelText={t('Home.label.brush')}
                />
              </View>
            </>
          )}

          {/* 太さ・色ボタン。レイヤの色分けが個別のときのみ常時表示し、
              手書き・通常の作図（プロット・フリーハンド）の両方に現在の色・太さが反映される。
              個別でないレイヤでは描画はレイヤのスタイル設定に従うため表示しない */}
          {(featureButton === 'LINE' || featureButton === 'POLYGON') && isIndividualStyleLayer && (
            <>
              {!isWidthPaletteOpen ? (
                <View style={styles.button}>
                  <Button
                    name={PEN_WIDTH[currentPenWidth]}
                    backgroundColor={COLOR.ALFABLUE}
                    borderRadius={10}
                    onPress={() => {
                      //単一オブジェクト選択中は、そのオブジェクトの太さを初期値にして開く（プロパティパネル方式）
                      if (selectedObjectWidthType !== undefined) setPenWidth(selectedObjectWidthType);
                      setWidthPaletteOpen(true);
                    }}
                    labelText={widthLabel(currentPenWidth)}
                  />
                </View>
              ) : (
                <View style={styles.widthPaletteRow}>
                  {(['PEN_THIN', 'PEN_MEDIUM', 'PEN_THICK'] as PenWidthType[]).map((width) => (
                    <View key={width} style={styles.widthPaletteButton}>
                      <Button
                        name={PEN_WIDTH[width]}
                        backgroundColor={currentPenWidth === width ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => selectPenWidth(width)}
                        labelText={widthLabel(width)}
                      />
                    </View>
                  ))}
                </View>
              )}
              <View style={styles.button}>
                <Button
                  name={MAPMEMOTOOL.COLOR}
                  backgroundColor={COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={() => setVisibleMapMemoColor(true)}
                  labelText={t('Home.label.color')}
                />
              </View>
            </>
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
