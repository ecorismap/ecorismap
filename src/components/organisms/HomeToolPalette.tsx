import React, { useContext } from 'react';
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

interface Props {
  items: ToolPaletteItemType[];
  featureType: FeatureButtonType;
}

/**
 * 編集レイヤの用途に合わせたツールパレット。「道具＋設定」を焼き込んだボタンを縦に並べ、
 * 1タップで持ち替えられるようにする（展開も設定モーダルも挟まない）。
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
    item.color === undefined
      ? undefined
      : hsv2rgbaString(item.color.hue, item.color.sat, item.color.val, item.color.alpha);

  //パレットのボタンは設定込みで1つの道具を表す。指定した設定が現在値と一致したときだけ有効表示にする
  const isItemActive = (item: ToolPaletteItemType) => {
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
    setHandwritingSubTool(item.subTool);
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
