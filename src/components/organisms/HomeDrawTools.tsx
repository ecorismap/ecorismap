import React, { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BRUSH, COLOR, DRAWTOOL, ERASER, LINETOOL, MAPMEMOTOOL, POINTTOOL, STAMP } from '../../constants/AppConstants';

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
import { isBrushTool, isEraserTool, isHandwritingTool, isStampTool } from '../../utils/General';
import { HandwritingSubToolType, MapMemoToolGroupType, MapMemoToolType } from '../../types';
import { ConfirmAsync } from '../molecules/AlertAsync';
import { HomeModalStyleSettings } from './HomeModalStyleSettings';
import { HomeToolPalette } from './HomeToolPalette';
import { getToolPalette } from '../../constants/ToolPalette';
import { useFeatureFlags } from '../../hooks/useFeatureFlags';

export const HomeDrawTools = React.memo(() => {
  const {
    isEditingDraw,
    isSelectedDraw,
    isEditingObject,
    isAreaSelected,
    currentDrawTool,
    currentLineTool,
    currentPolygonTool,
    featureButton,
    selectDrawTool,
    setLineTool,
    setPolygonTool,
    isIndividualStyleLayer,
    selectedObjectWidthType,
    selectedObjectArrowStyle,
    switchSelectionToSplit,
    handwritingSubTool,
    setHandwritingSubTool,
    openHandwritingSettingsTab,
    editingLayer,
  } = useContext(DrawingToolsContext);
  const {
    currentPenWidth,
    setPenWidth,
    currentMapMemoTool,
    selectMapMemoTool,
    arrowStyle,
    setArrowStyle,
    colorPickerColor,
    selectPenColor,
  } = useContext(MapMemoContext);

  //スタイル設定モーダル（太さ・矢印・色をタブで設定）
  const [visibleStyleSettings, setVisibleStyleSettings] = useState(false);

  //手書きで最後に使ったスタンプ・ブラシ・消しゴム種別（グループ再選択で復元。初回は設定を開く）
  const lastHandwritingTool = useRef<{
    STAMP?: HandwritingSubToolType;
    BRUSH?: HandwritingSubToolType;
    ERASER?: MapMemoToolType;
  }>({});
  useEffect(() => {
    if (isStampTool(handwritingSubTool)) lastHandwritingTool.current.STAMP = handwritingSubTool;
    else if (isBrushTool(handwritingSubTool)) lastHandwritingTool.current.BRUSH = handwritingSubTool;
  }, [handwritingSubTool]);
  useEffect(() => {
    if (isEraserTool(currentMapMemoTool)) lastHandwritingTool.current.ERASER = currentMapMemoTool;
  }, [currentMapMemoTool]);

  //スタンプ・ブラシ・消しゴム・設定・分割ボタンは一旦非表示（再表示するときはtrueに）
  const showHandwritingSubTools = false as boolean;

  //編集レイヤの用途に応じたツールパレット。定義があれば手書きのボタン群をこれに差し替える
  const { hisyouTool } = useFeatureFlags();
  const toolPaletteItems = useMemo(
    () => getToolPalette(editingLayer, featureButton, hisyouTool),
    [editingLayer, featureButton, hisyouTool]
  );

  //スタンプ・ブラシ・設定をまとめたボタン（個別スタイルのライン編集中のみ表示。タップで横に展開）
  const [isHwToolPaletteOpen, setHwToolPaletteOpen] = useState(false);
  const showHwToolPalette = featureButton === 'LINE' && isIndividualStyleLayer && (isEditingDraw || isEditingObject);
  useEffect(() => {
    if (!showHwToolPalette) setHwToolPaletteOpen(false);
  }, [showHwToolPalette]);

  //手書き系ツールは個別ボタン（ペン/スタンプ/ブラシ/消しゴム）。横展開パレットは廃止
  const eraserActive = isEraserTool(currentMapMemoTool);
  //地図移動ツールへ持ち替えている間も手書きセッションは続いているため、
  //持ち替え前のツール（currentLineTool/currentPolygonTool）で判定する。
  //ツール名だけで見ると全ボタンが未選択に見え、押すと再変換が走ってスタイルが戻る
  const handwritingActive =
    isHandwritingTool(currentDrawTool) ||
    (currentDrawTool === 'MOVE' && isHandwritingTool(featureButton === 'POLYGON' ? currentPolygonTool : currentLineTool));
  const hwActive = handwritingActive || eraserActive;
  const hwGroup: MapMemoToolGroupType = eraserActive
    ? 'ERASER'
    : isStampTool(handwritingSubTool)
      ? 'STAMP'
      : isBrushTool(handwritingSubTool)
        ? 'BRUSH'
        : 'PEN';

  const hwToolPaletteIcon =
    handwritingActive && isStampTool(handwritingSubTool)
      ? // @ts-ignore スタンプ有効中は現在の種別アイコン
        STAMP[handwritingSubTool]
      : handwritingActive && isBrushTool(handwritingSubTool)
        ? // @ts-ignore ブラシ有効中は現在の種別アイコン
          BRUSH[handwritingSubTool]
        : 'tools';

  //なげなわで選んで移動・回転している間は、作図の道具は今の操作と関係ないので押せないようにする
  //（抜けるのは確定・キャンセル。undo・削除・地図移動は移動中も使うので対象外）
  const isToolLocked = isAreaSelected;

  //手書きツールを有効化する（消しゴム中なら解除してから）
  const startHandwriting = () => {
    if (eraserActive) selectMapMemoTool(undefined);
    if (!handwritingActive) {
      setLineTool('HANDWRITING_LINE');
      selectDrawTool('HANDWRITING_LINE');
    }
  };

  const pressPenButton = () => {
    if (isToolLocked) return;
    if (handwritingActive && hwGroup === 'PEN') {
      //有効中の再タップは解除（編集選択中は解除しない。抜けるのはキャンセルで）
      if (!isSelectedDraw) selectDrawTool(currentDrawTool);
      return;
    }
    startHandwriting();
    setHandwritingSubTool('PEN');
  };

  const pressStampButton = () => {
    if (handwritingActive && hwGroup === 'STAMP') {
      if (!isSelectedDraw) selectDrawTool(currentDrawTool);
      return;
    }
    startHandwriting();
    const last = lastHandwritingTool.current.STAMP;
    if (last !== undefined) setHandwritingSubTool(last);
    else openHandwritingSettingsTab('STAMP');
  };

  const pressBrushButton = () => {
    if (handwritingActive && hwGroup === 'BRUSH') {
      if (!isSelectedDraw) selectDrawTool(currentDrawTool);
      return;
    }
    startHandwriting();
    const last = lastHandwritingTool.current.BRUSH;
    if (last !== undefined) setHandwritingSubTool(last);
    else openHandwritingSettingsTab('BRUSH');
  };

  const pressEraserButton = async () => {
    if (eraserActive) {
      selectMapMemoTool(undefined);
      return;
    }
    //消しゴムはメモのツールとして動き、手書きセッションは解除される。描きかけがあれば確認する
    if (isEditingDraw || isEditingObject) {
      const ret = await ConfirmAsync(t('Home.confirm.discard'));
      if (!ret) return;
    }
    const last = lastHandwritingTool.current.ERASER;
    if (last !== undefined) selectMapMemoTool(last);
    else openHandwritingSettingsTab('ERASER');
  };

  const pressSplitButton = () => {
    //編集選択中は選択オブジェクトを分割対象にしてから分割ツールへ
    if (isSelectedDraw && handwritingActive && !switchSelectionToSplit()) return;
    setLineTool('SPLIT_LINE');
    selectDrawTool('SPLIT_LINE');
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
    hwPaletteButton: {
      marginRight: 5,
      width: 40,
    },
    hwPaletteRow: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      marginTop: 2,
    },
    toolColumn: {
      //子（ツールボタン群）がストレッチして中身が横ずれしないようにする
      alignItems: 'flex-start',
    },
  });

  return (
    <>
      {/* 編集完了・キャンセルボタン */}
      <HomeEditControlButtons />

      {/* スタイル設定モーダル（太さ・矢印・色をタブで設定） */}
      <HomeModalStyleSettings
        visible={visibleStyleSettings}
        showArrow={featureButton === 'LINE'}
        //植生図は区分（＝色）だけを持ち替えるので太さは出さず、スタイルボタンはそのまま色設定になる
        showWidth={editingLayer?.toolPalette !== 'VEGETATION'}
        initialPenWidth={selectedObjectWidthType ?? currentPenWidth}
        initialArrowStyle={selectedObjectArrowStyle ?? arrowStyle}
        initialColor={colorPickerColor}
        selectPenWidth={setPenWidth}
        selectArrowStyle={setArrowStyle}
        selectColor={selectPenColor}
        close={() => setVisibleStyleSettings(false)}
      />

      {/* 編集レイヤ名の表示・切替チップ */}
      <HomeEditingLayerButton />

      <View style={styles.buttonContainer}>
        <View style={styles.toolColumn}>
          {featureButton === 'POINT' &&
            (!editPositionMode || editPositionWithoutCoord) &&
            !isSelectedDraw &&
            !isEditingDraw && (
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
          {/* 飛翔図は1本＝1飛翔を手書きでなぞるので、プロットでの追加は出さない */}
          {featureButton === 'LINE' && editingLayer?.toolPalette !== 'HISYOU' && (
            <HomeLineToolButton
              disabled={isToolLocked}
              currentDrawTool={currentDrawTool}
              selectDrawTool={selectDrawTool}
              setLineTool={setLineTool}
            />
          )}

          {/* 用途別パレットがあるレイヤは、手書きのボタン群をパレットに差し替える */}
          {featureButton === 'LINE' && toolPaletteItems !== undefined && (
            <HomeToolPalette items={toolPaletteItems} featureType={featureButton} />
          )}

          {/* 手書き系ツール（LINEのみ）。ペン/スタンプ/ブラシ/消しゴムを個別ボタンで直接選ぶ */}
          {featureButton === 'LINE' && toolPaletteItems === undefined && (
            <>
              <View style={styles.button}>
                <Button
                  name={LINETOOL.HANDWRITING_LINE}
                  disabled={isToolLocked}
                  backgroundColor={
                    isToolLocked ? COLOR.ALFAGRAY : handwritingActive && hwGroup === 'PEN' ? COLOR.ALFARED : COLOR.ALFABLUE
                  }
                  borderRadius={10}
                  onPress={pressPenButton}
                  labelText={t('Home.label.handwritingLine')}
                  labelFontSize={9}
                />
              </View>
              {/* スタンプ・ブラシ・設定の集約ボタン。個別スタイルのライン編集中のみ、タップで横に展開 */}
              {showHwToolPalette &&
                (!isHwToolPaletteOpen ? (
                  <View style={styles.button}>
                    <Button
                      // @ts-ignore
                      name={hwToolPaletteIcon}
                      disabled={isToolLocked}
                      backgroundColor={
                        isToolLocked
                          ? COLOR.ALFAGRAY
                          : handwritingActive && (hwGroup === 'STAMP' || hwGroup === 'BRUSH')
                            ? COLOR.ALFARED
                            : COLOR.ALFABLUE
                      }
                      borderRadius={10}
                      onPress={() => setHwToolPaletteOpen(true)}
                      labelText={t('Home.label.tools')}
                      labelFontSize={9}
                    />
                  </View>
                ) : (
                  <View style={styles.hwPaletteRow}>
                    <View style={styles.hwPaletteButton}>
                      <Button
                        name={MAPMEMOTOOL.STAMP}
                        backgroundColor={handwritingActive && hwGroup === 'STAMP' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => {
                          setHwToolPaletteOpen(false);
                          pressStampButton();
                        }}
                        labelText={t('Home.label.stamp')}
                        labelFontSize={9}
                      />
                    </View>
                    <View style={styles.hwPaletteButton}>
                      <Button
                        name={MAPMEMOTOOL.BRUSH}
                        backgroundColor={handwritingActive && hwGroup === 'BRUSH' ? COLOR.ALFARED : COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => {
                          setHwToolPaletteOpen(false);
                          pressBrushButton();
                        }}
                        labelText={t('Home.label.brush')}
                      />
                    </View>
                    <View style={styles.hwPaletteButton}>
                      <Button
                        name={'cog'}
                        backgroundColor={COLOR.ALFABLUE}
                        borderRadius={10}
                        onPress={() => {
                          setHwToolPaletteOpen(false);
                          openHandwritingSettingsTab(hwGroup);
                        }}
                        labelText={t('Home.label.setting')}
                      />
                    </View>
                  </View>
                ))}
              {showHandwritingSubTools && (
                <>
                  <View style={styles.button}>
                    <Button
                      name={
                        // @ts-ignore 現在のスタンプ種別のアイコンを表示
                        (handwritingActive && hwGroup === 'STAMP' && STAMP[handwritingSubTool]) || MAPMEMOTOOL.STAMP
                      }
                      backgroundColor={handwritingActive && hwGroup === 'STAMP' ? COLOR.ALFARED : COLOR.ALFABLUE}
                      borderRadius={10}
                      onPress={pressStampButton}
                      labelText={t('Home.label.stamp')}
                      labelFontSize={9}
                    />
                  </View>
                  <View style={styles.button}>
                    <Button
                      name={
                        // @ts-ignore 現在のブラシ種別のアイコンを表示
                        (handwritingActive && hwGroup === 'BRUSH' && BRUSH[handwritingSubTool]) || MAPMEMOTOOL.BRUSH
                      }
                      backgroundColor={handwritingActive && hwGroup === 'BRUSH' ? COLOR.ALFARED : COLOR.ALFABLUE}
                      borderRadius={10}
                      onPress={pressBrushButton}
                      labelText={t('Home.label.brush')}
                    />
                  </View>
                  <View style={styles.button}>
                    <Button
                      name={
                        // @ts-ignore 現在の消しゴム種別のアイコンを表示
                        (eraserActive && ERASER[currentMapMemoTool]) || MAPMEMOTOOL.ERASER
                      }
                      backgroundColor={eraserActive ? COLOR.ALFARED : COLOR.ALFABLUE}
                      borderRadius={10}
                      onPress={pressEraserButton}
                      labelText={t('Home.label.eraser')}
                      labelFontSize={9}
                    />
                  </View>
                </>
              )}
            </>
          )}
          {/* 分割は単独ボタン。プロット作図中と編集選択中に表示する */}
          {showHandwritingSubTools &&
            featureButton === 'LINE' &&
            ((isEditingDraw && !handwritingActive) || (isSelectedDraw && handwritingActive)) && (
              <View style={styles.button}>
                <Button
                  id={'SPLIT_LINE'}
                  name={LINETOOL.SPLIT_LINE}
                  backgroundColor={currentDrawTool === 'SPLIT_LINE' ? COLOR.ALFARED : COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={pressSplitButton}
                  labelText={t('Home.label.splitLine')}
                />
              </View>
            )}
          {showHandwritingSubTools && featureButton === 'LINE' && hwActive && (
            <View style={styles.button}>
              <Button
                name={'cog'}
                backgroundColor={COLOR.ALFABLUE}
                borderRadius={10}
                onPress={() => openHandwritingSettingsTab(hwGroup)}
                labelText={t('Home.label.setting')}
              />
            </View>
          )}
          {/* 区分パレット（植生図）は「次に描く区分」を決めるものなので、追加・手書きボタンより上に置く */}
          {featureButton === 'POLYGON' && toolPaletteItems !== undefined && (
            <HomeToolPalette items={toolPaletteItems} featureType={featureButton} />
          )}
          {featureButton === 'POLYGON' && (
            <HomePolygonToolButton
              disabled={isToolLocked}
              currentDrawTool={currentDrawTool}
              selectDrawTool={selectDrawTool}
              setPolygonTool={setPolygonTool}
              //区分パレット（植生図）は描き方を変えないので、手書き・プロットのボタンは残す
              hideHandwriting={false}
            />
          )}

          {/* スタイルボタン（太さ・矢印・色選択を集約）。レイヤの色分けが個別のときのみ表示し、
              手書き・通常の作図（プロット）の両方に現在の設定が反映される。
              タップで横に太さ/矢印/色選択が開き、太さ・矢印はさらに3択に展開する */}
          {(featureButton === 'LINE' || featureButton === 'POLYGON') && isIndividualStyleLayer && (
            <>
              <View style={styles.button}>
                <Button
                  name={'palette'}
                  disabled={isToolLocked}
                  backgroundColor={isToolLocked ? COLOR.ALFAGRAY : COLOR.ALFABLUE}
                  borderRadius={10}
                  onPress={() => setVisibleStyleSettings(true)}
                  labelText={t('Home.label.styleTool')}
                  labelFontSize={9}
                />
              </View>
            </>
          )}
        </View>

        {/* 編集中はグレーアウトではなく非表示にする */}
        {!editPositionMode && !isSelectedDraw && !isEditingDraw && !isEditingObject && <SelectToolButton />}
        {/* 編集選択は選択前でも表示する。ツールON中は2本指で地図が動かないため、
            対象を探すパン・ズームはこのボタンへの持ち替えで行う */}
        {(isEditingDraw || isEditingObject || currentDrawTool === 'SELECT') && <MoveToolButton />}
        <PencilLockButton />
        {(isEditingDraw || isEditingObject || eraserActive) && <UndoToolButton />}
        {(isEditingDraw || isEditingObject || eraserActive) && <RedoToolButton />}
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
