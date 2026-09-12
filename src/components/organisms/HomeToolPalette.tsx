import React, { useContext, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { MapMemoContext } from '../../contexts/MapMemo';
import { isEraserTool, isHandwritingTool } from '../../utils/General';
import { hsv2rgbaString } from '../../utils/Color';
import { ConfirmAsync } from '../molecules/AlertAsync';
import { t } from '../../i18n/config';
import { FeatureButtonType, ToolPaletteItemType } from '../../types';
import { HomeModalCategoryPicker } from './HomeModalCategoryPicker';

interface Props {
  items: ToolPaletteItemType[];
  featureType: FeatureButtonType;
}

/**
 * 編集レイヤの用途に合わせたツールパレット。1タップで持ち替えられるようボタンを縦に並べる
 * （展開も設定モーダルも挟まない）。2種類ある。
 * - 道具を持ち替える（飛翔図）: ペン・ブラシ・スタンプの設定を焼き込んだボタン
 * - 区分を持ち替える（植生図）: 次に描くオブジェクトの区分を決めるボタン。描き方（手書き／
 *   プロット）は従来のツールボタンで選ぶので、どちらでも同じ区分で描ける
 */
export const HomeToolPalette = React.memo(({ items, featureType }: Props) => {
  const {
    currentDrawTool,
    isSelectedDraw,
    isEditingDraw,
    isEditingObject,
    selectDrawTool,
    setLineTool,
    setPolygonTool,
    handwritingSubTool,
    setHandwritingSubTool,
    editingLayer,
    selectCategoryValue,
    addCategoryValue,
    updateCategoryValue,
    deleteCategoryValue,
  } = useContext(DrawingToolsContext);
  const {
    currentPenWidth,
    setPenWidth,
    arrowStyle,
    setArrowStyle,
    penColor,
    selectPenColor,
    currentMapMemoTool,
    selectMapMemoTool,
  } = useContext(MapMemoContext);

  const eraserActive = isEraserTool(currentMapMemoTool);
  const handwritingActive = isHandwritingTool(currentDrawTool);
  //ポリゴンの手書き（フリー）はペン固定なので、持ち替えの対象は太さと色だけになる
  const isPolygon = featureType === 'POLYGON';

  const itemColor = (item: ToolPaletteItemType) =>
    item.colorHex ??
    (item.color === undefined
      ? undefined
      : hsv2rgbaString(item.color.hue, item.color.sat, item.color.val, item.color.alpha));

  //区分を選ぶパレットか（植生図）。現在の区分はフィールドの既定値で持つ
  const isCategoryPalette = items.some((item) => item.fieldValue !== undefined);
  const currentCategoryValue = editingLayer?.field.find(
    (f) => f.name === editingLayer.colorStyle.fieldName
  )?.defaultValue;
  const [isCategoryPickerOpen, setCategoryPickerOpen] = useState(false);

  //パレットのボタンは設定込みで1つの道具を表す。指定した設定が現在値と一致したときだけ有効表示にする
  const isItemActive = (item: ToolPaletteItemType) => {
    if (item.fieldValue !== undefined) return currentCategoryValue === item.fieldValue;
    if (item.eraser !== undefined) return currentMapMemoTool === item.eraser;
    if (!handwritingActive) return false;
    if (!isPolygon && handwritingSubTool !== item.subTool) return false;
    if (item.penWidth !== undefined && currentPenWidth !== item.penWidth) return false;
    if (item.arrowStyle !== undefined && arrowStyle !== item.arrowStyle) return false;
    const color = itemColor(item);
    if (color !== undefined && penColor !== color) return false;
    return true;
  };

  const pressItem = async (item: ToolPaletteItemType) => {
    if (item.fieldValue !== undefined) {
      //区分は描き方を変えないので、選び直すだけ（同じものを押しても解除しない）
      selectCategoryValue(item.fieldValue);
      return;
    }
    if (isItemActive(item)) {
      //有効中の再タップは解除（編集選択中は解除しない。抜けるのはキャンセルで）
      if (item.eraser !== undefined) selectMapMemoTool(undefined);
      else if (!isSelectedDraw) selectDrawTool(currentDrawTool);
      return;
    }
    if (item.eraser !== undefined) {
      //消しゴムはメモのツールとして動き、手書きセッションは解除される。描きかけがあれば確認する
      if (isEditingDraw || isEditingObject) {
        const ret = await ConfirmAsync(t('Home.confirm.discard'));
        if (!ret) return;
      }
      selectMapMemoTool(item.eraser);
      return;
    }
    if (eraserActive) selectMapMemoTool(undefined);
    if (!handwritingActive) {
      if (isPolygon) {
        setPolygonTool('HANDWRITING_POLYGON');
        selectDrawTool('HANDWRITING_POLYGON');
      } else {
        setLineTool('HANDWRITING_LINE');
        selectDrawTool('HANDWRITING_LINE');
      }
    }
    if (item.subTool !== undefined) setHandwritingSubTool(item.subTool);
    if (item.penWidth !== undefined) setPenWidth(item.penWidth);
    if (item.arrowStyle !== undefined) setArrowStyle(item.arrowStyle);
    if (item.color !== undefined) {
      const { hue, sat, val, alpha } = item.color;
      selectPenColor(hue, sat, val, alpha);
    }
  };

  const styles = StyleSheet.create({
    button: {
      alignSelf: 'flex-start',
      marginTop: 2,
      width: 40,
    },
  });

  //区分は数十になることがありツールバーに並べきれないので、現在の区分のボタン1つにまとめ、
  //持ち替えるときだけ一覧を開く
  if (isCategoryPalette) {
    const selectedItem = items.find((item) => item.fieldValue === currentCategoryValue);
    return (
      <>
        <View style={styles.button}>
          <Button
            name="checkbox-blank-circle"
            color={selectedItem?.colorHex ?? COLOR.WHITE}
            backgroundColor={COLOR.ALFABLUE}
            borderRadius={10}
            onPress={() => setCategoryPickerOpen(true)}
            labelText={selectedItem?.label ?? t('common.category')}
            labelFontSize={9}
          />
        </View>
        <HomeModalCategoryPicker
          visible={isCategoryPickerOpen}
          items={items}
          selectedValue={typeof currentCategoryValue === 'string' ? currentCategoryValue : undefined}
          select={selectCategoryValue}
          add={addCategoryValue}
          update={updateCategoryValue}
          remove={deleteCategoryValue}
          close={() => setCategoryPickerOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      {items.map((item) => (
        <View key={item.id} style={styles.button}>
          <Button
            // @ts-ignore アイコン名はパレット定義が持つ
            name={item.icon}
            //区分ごとに色を変えるパレットは、どの色で描くのかをアイコンの色で示す
            color={itemColor(item) ?? COLOR.WHITE}
            backgroundColor={isItemActive(item) ? COLOR.ALFARED : COLOR.ALFABLUE}
            borderRadius={10}
            onPress={() => pressItem(item)}
            labelText={item.label}
            labelFontSize={9}
          />
        </View>
      ))}
    </>
  );
});
