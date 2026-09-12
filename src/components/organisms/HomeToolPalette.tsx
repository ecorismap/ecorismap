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
import { HomeModalSubToolPicker } from './HomeModalSubToolPicker';
import { getFieldOptions } from '../../constants/ToolPalette';

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
    selectFieldValues,
    addFieldValue,
    updateFieldValue,
    deleteFieldValue,
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

  //属性ボタンで開く選択肢（種名・雌雄・成幼はタブで切り替える／区分は1つ）と、
  //道具ボタンで開く選択肢（行動範囲・行動位置）
  const [pickerFields, setPickerFields] = useState<string[] | undefined>(undefined);
  //属性が未選択のまま道具を選んだとき、属性を選び終えてから実行する道具
  const [pendingItem, setPendingItem] = useState<ToolPaletteItemType | undefined>(undefined);
  const [pickerOptions, setPickerOptions] = useState<ToolPaletteItemType[] | undefined>(undefined);

  //そのフィールドで今選んでいる値（＝次に描くオブジェクトへ入る値）
  const fieldValueOf = (fieldName: string) => {
    const value = editingLayer?.field.find((f) => f.name === fieldName)?.defaultValue;
    return typeof value === 'string' ? value : undefined;
  };
  const isColorField = (fieldName: string) => editingLayer?.colorStyle.fieldName === fieldName;

  //パレットのボタンは設定込みで1つの道具を表す。指定した設定が現在値と一致したときだけ有効表示にする
  //属性をまとめたボタンか（中身がフィールドの選択ボタン）
  const fieldNamesOf = (item: ToolPaletteItemType) => {
    if (item.fieldName !== undefined) return [item.fieldName];
    const names = (item.options ?? []).flatMap((option) => (option.fieldName === undefined ? [] : [option.fieldName]));
    return names.length > 0 ? names : undefined;
  };

  //パレットが持つ属性の一覧と、色を決める属性が未選択か（未選択なら描く前に選んでもらう）
  const paletteFieldNames = items.flatMap((item) => fieldNamesOf(item) ?? []);
  const colorFieldName = paletteFieldNames.find((name) => isColorField(name));
  const needsAttributes = colorFieldName !== undefined && (fieldValueOf(colorFieldName) ?? '') === '';

  const isItemActive = (item: ToolPaletteItemType) => {
    //属性ボタンは道具ではないので有効・無効の色分けはしない
    if (fieldNamesOf(item) !== undefined) return false;
    if (item.options !== undefined) {
      return handwritingActive && item.options.some((option) => option.subTool === handwritingSubTool);
    }
    if (item.eraser !== undefined) return currentMapMemoTool === item.eraser;
    if (!handwritingActive) return false;
    if (!isPolygon && handwritingSubTool !== item.subTool) return false;
    //ペンは「描いている道具」が一致していれば有効表示にする。太さ・矢印は後から変えられる設定で、
    //一致を求めると編集選択で入ったときに有効に見えない
    if (item.subTool !== 'PEN') {
      if (item.penWidth !== undefined && currentPenWidth !== item.penWidth) return false;
      if (item.arrowStyle !== undefined && arrowStyle !== item.arrowStyle) return false;
    }
    const color = itemColor(item);
    if (color !== undefined && penColor !== color) return false;
    return true;
  };

  //行動範囲・行動位置は飛翔線に付ける記号なので、線を描いている（編集している）間だけ使える
  const isOptionGroupDisabled = (item: ToolPaletteItemType) =>
    item.options !== undefined && fieldNamesOf(item) === undefined && !isEditingDraw && !isEditingObject;

  const pressItem = async (item: ToolPaletteItemType, skipAttributeCheck = false) => {
    if (isOptionGroupDisabled(item)) return;
    const fieldNames = fieldNamesOf(item);
    //属性が未選択のまま描き始めないよう、先に選んでもらう（選び終えたらこの道具を有効にする）
    if (!skipAttributeCheck && fieldNames === undefined && item.eraser === undefined && needsAttributes) {
      setPendingItem(item);
      setPickerFields(paletteFieldNames);
      return;
    }
    if (fieldNames !== undefined) {
      //属性は描き方を変えない。選択肢から選び直すだけ
      setPickerFields(fieldNames);
      return;
    }
    if (item.options !== undefined) {
      //行動範囲・行動位置はまとめたボタン。中の道具を選んでから持ち替える
      setPickerOptions(item.options);
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

  //属性ボタンは今選んでいる値を表示する。まとめたボタンは代表（先頭＝色を決める属性）を出す
  const fieldButtonProps = (fieldNames: string[], item: ToolPaletteItemType) => {
    const fieldName = fieldNames[0];
    const value = fieldValueOf(fieldName);
    const options = editingLayer === undefined ? [] : getFieldOptions(editingLayer, fieldName);
    const selected = options.find((option) => option.fieldValue === value);
    return {
      icon: isColorField(fieldName) ? 'checkbox-blank-circle' : 'form-select',
      color: selected?.colorHex ?? COLOR.WHITE,
      label: selected?.label ?? item.label,
    };
  };

  //道具をまとめたボタンは、今選んでいる道具のアイコンを出す
  const optionButtonProps = (item: ToolPaletteItemType) => {
    const selected = item.options?.find((option) => option.subTool === handwritingSubTool);
    const active = handwritingActive && selected !== undefined;
    //ボタンは幅40pxなので、長い名前は短縮名を使う（一覧では正式名を出す）
    return {
      icon: active ? selected!.icon : item.icon,
      label: active ? (selected!.shortLabel ?? selected!.label) : item.label,
    };
  };

  return (
    <>
      {items.map((item) => {
        const fieldNames = fieldNamesOf(item);
        const buttonProps: { icon: string; color: string; label: string } =
          fieldNames !== undefined
            ? fieldButtonProps(fieldNames, item)
            : item.options !== undefined
            ? { ...optionButtonProps(item), color: COLOR.WHITE }
            : { icon: item.icon, color: itemColor(item) ?? COLOR.WHITE, label: item.label };
        return (
          <View key={item.id} style={styles.button}>
            <Button
              // @ts-ignore アイコン名はパレット定義が持つ
              name={buttonProps.icon}
              //値ごとに色を変えるパレットは、どの色で描くのかをアイコンの色で示す
              color={buttonProps.color}
              disabled={isOptionGroupDisabled(item)}
              backgroundColor={
                isOptionGroupDisabled(item)
                  ? COLOR.ALFAGRAY
                  : isItemActive(item)
                  ? COLOR.ALFARED
                  : COLOR.ALFABLUE
              }
              borderRadius={10}
              onPress={() => pressItem(item)}
              labelText={buttonProps.label}
              labelFontSize={9}
            />
          </View>
        );
      })}

      {/* 属性の選択肢。複数あればタブで切り替える。色分けに使うフィールドは色も決められる */}
      <HomeModalCategoryPicker
        visible={pickerFields !== undefined}
        fields={pickerFields ?? []}
        optionsOf={(fieldName: string) => (editingLayer === undefined ? [] : getFieldOptions(editingLayer, fieldName))}
        isColorField={isColorField}
        select={(values: { [fieldName: string]: string }) => {
          selectFieldValues(values);
          //属性が未選択のまま押した道具があれば、選び終えたところで有効にする
          const next = pendingItem;
          setPendingItem(undefined);
          if (next !== undefined) pressItem(next, true);
        }}
        add={addFieldValue}
        update={updateFieldValue}
        remove={deleteFieldValue}
        close={() => {
          setPendingItem(undefined);
          setPickerFields(undefined);
        }}
      />

      {/* 行動範囲・行動位置の道具。選ぶとその道具に持ち替える */}
      <HomeModalSubToolPicker
        visible={pickerOptions !== undefined}
        items={pickerOptions ?? []}
        selectedSubTool={handwritingActive ? handwritingSubTool : undefined}
        select={(option: ToolPaletteItemType) => {
          setPickerOptions(undefined);
          pressItem(option);
        }}
        close={() => setPickerOptions(undefined)}
      />
    </>
  );
});
