import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, TextInput } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { Pressable } from '../atoms/Pressable';
import ColorPicker, { Panel1, HueSlider, OpacitySlider, Swatches, colorKit } from 'reanimated-color-picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ConfirmAsync } from '../molecules/AlertAsync';
import { t } from '../../i18n/config';
import { ToolPaletteItemType } from '../../types';
import { hsv2rgbaString } from '../../utils/Color';

interface Props {
  visible: boolean;
  //切り替えるフィールド（種名・性別・齢／区分）。2つ以上ならタブで分ける
  fields: string[];
  optionsOf: (fieldName: string) => ToolPaletteItemType[];
  //色分けに使うフィールドか（そのときだけ色も決められる）
  isColorField: (fieldName: string) => boolean;
  select: (values: { [fieldName: string]: string }) => void;
  add: (fieldName: string, value: string, color: string, code: string) => void;
  update: (fieldName: string, oldValue: string, newValue: string, color: string, code: string) => void;
  //レイヤ設定で「コードの入れ先」を決めてあるか（決めてあればコードも入力してもらう）
  withCode: (fieldName: string) => boolean;
  remove: (fieldName: string, value: string) => void;
  close: () => void;
}

//区分を足すときの色見本。面に重ねるので半透明にしておく（プリセットと同じ濃さ）
const NEW_CATEGORY_COLORS = [
  'rgba(27,94,32,0.5)',
  'rgba(102,187,106,0.5)',
  'rgba(139,195,74,0.5)',
  'rgba(205,220,57,0.5)',
  'rgba(255,213,79,0.5)',
  'rgba(255,138,101,0.5)',
  'rgba(161,136,127,0.5)',
  'rgba(66,165,245,0.5)',
  'rgba(149,117,205,0.5)',
  'rgba(158,158,158,0.5)',
];

/**
 * 区分を選ぶモーダル（植生図など）。区分は数十になることがあるためツールバーには収まらない。
 * ツールバーには現在の区分のボタンだけを置き、持ち替えるときだけこの一覧を開く
 */
export const HomeModalCategoryPicker = React.memo((props: Props) => {
  const { visible, fields, optionsOf, isColorField, withCode, select, add, update, remove, close } = props;
  //種名→性別→齢と順に選ぶ。今どれを選んでいるか
  const [step, setStep] = useState(0);
  //開くたびに未選択から選び直す。選んだ値はモーダルの中だけで持ち、最後まで選び終えたときに
  //まとめて反映する。Cancel（背景タップ含む）なら何も変えない
  const [pending, setPending] = useState<{ [fieldName: string]: string }>({});
  const field = fields[Math.min(step, fields.length - 1)] ?? '';
  const items = field === '' ? [] : optionsOf(field);
  const selectedValue = field === '' ? undefined : pending[field];
  const withColor = field !== '' && isColorField(field);
  //現地で区分が増える・言い換えることがあるので、レイヤ設定へ戻らずここで足す・直せるようにする。
  //editingValueがundefinedなら新規追加、値が入っていればその区分の編集
  const [isEditing, setIsEditing] = useState(false);
  const [editingValue, setEditingValue] = useState<string | undefined>(undefined);
  const [newValue, setNewValue] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newColor, setNewColor] = useState(NEW_CATEGORY_COLORS[0]);

  useEffect(() => {
    if (!visible) return;
    setStep(0);
    setPending({});
    setIsEditing(false);
    setEditingValue(undefined);
    setNewValue('');
    setNewCode('');
    setNewColor(NEW_CATEGORY_COLORS[0]);
    //fieldsは開くたびに作られる配列なので、中身で比較する
    //eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, fields.join(',')]);

  const startAdd = () => {
    setEditingValue(undefined);
    setNewValue('');
    setNewCode('');
    setNewColor(NEW_CATEGORY_COLORS[0]);
    setIsEditing(true);
  };

  const startEdit = (item: ToolPaletteItemType) => {
    setEditingValue(item.fieldValue);
    setNewValue(item.label);
    setNewCode(item.fieldCode ?? '');
    setNewColor(item.colorHex ?? NEW_CATEGORY_COLORS[0]);
    setIsEditing(true);
  };

  const pressDelete = async () => {
    if (editingValue === undefined) return;
    const ret = await ConfirmAsync(t('Home.confirm.deleteCategory'));
    if (!ret) return;
    remove(field, editingValue);
    close();
  };

  //色ピッカーの操作結果はrgba文字列で持つ（他の色設定と同じ持ち方）
  const onPickColor = ({ hex }: { hex: string }) => {
    const hsv = colorKit.HSV(hex).object();
    setNewColor(hsv2rgbaString(hsv.h, hsv.s / 100, hsv.v / 100, hsv.a));
  };

  const trimmedValue = newValue.trim();
  const trimmedCode = newCode.trim();
  //編集中の区分は自分自身とは重複しない
  const others = items.filter((item) => item.fieldValue !== editingValue);
  //同じ名前の区分は作れない
  const isDuplicatedValue = others.some((item) => item.fieldValue === trimmedValue);
  //コードは図面の表記に使うので、重複すると区別がつかない。空欄は許す（コードを付けない区分もある）
  const isDuplicatedCode = trimmedCode !== '' && others.some((item) => (item.fieldCode ?? '') === trimmedCode);
  const canApply = trimmedValue !== '' && !isDuplicatedValue && !isDuplicatedCode;
  //押せない理由が分からないと直しようがないので、重複しているときは理由を出す
  const applyError = isDuplicatedValue
    ? t('Home.message.duplicateValue')
    : isDuplicatedCode
    ? t('Home.message.duplicateCode')
    : '';

  const pressApply = () => {
    if (!canApply) return;
    const code = trimmedCode;
    if (editingValue === undefined) add(field, trimmedValue, newColor, code);
    else update(field, editingValue, trimmedValue, newColor, code);
    setIsEditing(false);
    const next = { ...pending, [field]: trimmedValue };
    setPending(next);
    if (step < fields.length - 1) {
      setStep(step + 1);
      return;
    }
    select(next);
    close();
  };

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <Pressable style={styles.overlay} onPress={close} disablePressedAnimation>
        <Pressable style={styles.card} onPress={() => {}} disablePressedAnimation>
          {/* タブは残しつつ、値を選ぶと次の属性へ自動で切り替わる（種名→性別→齢） */}
          {fields.length > 1 ? (
            <View style={styles.segmentContainer}>
              {fields.map((name, index) => (
                <Pressable
                  key={name}
                  style={[styles.segment, field === name && styles.segmentActive]}
                  onPress={() => {
                    setIsEditing(false);
                    setStep(index);
                  }}
                  disablePressedAnimation
                >
                  <Text style={[styles.segmentLabel, field === name && styles.segmentLabelActive]}>{name}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.title}>{field}</Text>
          )}
          {!isEditing && (
          <ScrollView
            style={styles.listArea}
            contentContainerStyle={styles.list}
            //小画面ではスクロールが必要になるため、続きがあることが分かるよう表示する
            showsVerticalScrollIndicator={true}
          >
            {items.map((item) => {
              const selected = item.fieldValue === selectedValue;
              return (
                <Pressable
                  key={item.id}
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => {
                    if (item.fieldValue === undefined) return;
                    const next = { ...pending, [field]: item.fieldValue };
                    setPending(next);
                    //次の属性があれば続けて選ぶ（種名→性別→齢）。選び終えたらまとめて反映する
                    if (step < fields.length - 1) {
                      setStep(step + 1);
                      return;
                    }
                    select(next);
                    close();
                  }}
                  //長押しで名前・色を直す（色分けに使う属性だけ）
                  onLongPress={() => withColor && startEdit(item)}
                  disablePressedAnimation
                >
                  {withColor && <View style={[styles.swatch, { backgroundColor: item.colorHex ?? COLOR.GRAY2 }]} />}
                  <Text style={[styles.rowText, selected && styles.rowTextSelected]} numberOfLines={1}>
                    {item.fieldCode ? `${item.fieldCode} ${item.label}` : item.label}
                  </Text>
                  {withColor && (
                    <Pressable style={styles.editButton} onPress={() => startEdit(item)} disablePressedAnimation>
                      <MaterialCommunityIcons name="pencil" size={16} color={COLOR.GRAY3} />
                    </Pressable>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          )}
          {isEditing ? (
            <View style={styles.addArea}>
              <View style={styles.inputRow}>
                {withColor && <View style={[styles.swatch, { backgroundColor: newColor }]} />}
                <TextInput
                  style={styles.input}
                  value={newValue}
                  onChangeText={setNewValue}
                  placeholder={field}
                  placeholderTextColor={COLOR.GRAY2}
                  autoFocus
                />
                {/* コードの入れ先を決めてある属性は、選ぶだけでコードも入るよう一緒に登録する */}
                {withCode(field) && (
                  <TextInput
                    style={styles.codeInput}
                    value={newCode}
                    onChangeText={setNewCode}
                    placeholder={t('common.code')}
                    placeholderTextColor={COLOR.GRAY2}
                  />
                )}
              </View>
              {applyError !== '' && <Text style={styles.errorText}>{applyError}</Text>}
              {/* 色は見本から選ぶか、ピッカーで自由に決める（メモ・スタイル設定と同じ構成） */}
              {withColor && (
              <ColorPicker
                value={newColor}
                sliderThickness={18}
                thumbSize={22}
                thumbShape="circle"
                onCompleteJS={onPickColor}
                style={styles.colorPicker}
              >
                <View style={styles.panelHueContainer}>
                  <Panel1 style={styles.panel} />
                  <HueSlider style={styles.hueSlider} vertical reverse />
                </View>
                <OpacitySlider style={styles.opacitySlider} />
                <Swatches style={styles.swatches} swatchStyle={styles.colorChip} colors={NEW_CATEGORY_COLORS} />
              </ColorPicker>
              )}
            </View>
          ) : (
            withColor && (
              <Pressable style={styles.addButton} onPress={startAdd} disablePressedAnimation>
                <Text style={styles.addButtonText}>{`＋ ${t('common.add')}`}</Text>
              </Pressable>
            )
          )}
          <View style={styles.footerRow}>
            <Pressable style={styles.secondaryButton} onPress={close}>
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </Pressable>
            {isEditing && editingValue !== undefined && (
              <Pressable style={styles.deleteButton} onPress={pressDelete} disablePressedAnimation>
                <Text style={styles.deleteButtonText}>{t('common.delete')}</Text>
              </Pressable>
            )}
            {isEditing && (
              <Pressable
                style={[styles.primaryButton, !canApply && styles.primaryButtonDisabled]}
                onPress={pressApply}
                disablePressedAnimation
              >
                <Text style={styles.primaryButtonText}>OK</Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  addArea: {
    borderColor: COLOR.GRAY1,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 8,
    padding: 8,
  },
  addButton: {
    alignItems: 'center',
    borderColor: COLOR.GRAY1,
    borderRadius: 10,
    borderStyle: 'dashed',
    borderWidth: 1,
    marginTop: 8,
    paddingVertical: 10,
  },
  addButtonText: {
    color: COLOR.BLUE,
    fontSize: 14,
  },
  card: {
    backgroundColor: COLOR.WHITE,
    borderRadius: 20,
    elevation: 5,
    //小画面（iPhone SE等）でもCancel/OKのフッターが画面内に残るように制限。溢れる分はリストがスクロール
    maxHeight: '85%',
    maxWidth: 360,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
    shadowColor: COLOR.BLACK,
    shadowOffset: { height: 2, width: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    width: '90%',
  },
  errorText: {
    color: COLOR.DARKRED,
    fontSize: 11,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 4,
  },
  //タブバーと内容の区切りが分かるよう、選択肢の領域に薄く色を敷く
  listArea: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 10,
    //カードのmaxHeight内に収まるよう縮み、溢れた分はスクロールで見せる
    flexGrow: 0,
    flexShrink: 1,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: COLOR.MODAL_OVERLAY,
    flex: 1,
    justifyContent: 'center',
  },
  row: {
    alignItems: 'center',
    borderColor: COLOR.GRAY1,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    marginVertical: 3,
    paddingHorizontal: 8,
    paddingVertical: 8,
    //固定幅だと狭い画面（iPhone SE等）で2列が入らず1列になるため割合指定にする
    width: '48%',
  },
  //選択中の見た目はタブと揃える（青地に白文字）。どれを選んでいるか一目で分かる
  rowSelected: {
    backgroundColor: COLOR.BLUE,
    borderColor: COLOR.BLUE,
  },
  rowText: {
    color: COLOR.BLACK,
    flex: 1,
    fontSize: 14,
  },
  rowTextSelected: {
    color: COLOR.WHITE,
    fontWeight: 'bold',
  },
  colorChip: {
    borderRadius: 4,
    height: 24,
    width: 24,
  },
  colorPicker: {
    marginTop: 10,
    width: '100%',
  },
  hueSlider: {
    height: '100%',
  },
  codeInput: {
    borderBottomColor: COLOR.GRAY2,
    borderBottomWidth: 1,
    color: COLOR.BLACK,
    fontSize: 16,
    marginLeft: 8,
    paddingVertical: 6,
    width: 60,
  },
  input: {
    borderBottomColor: COLOR.GRAY2,
    borderBottomWidth: 1,
    color: COLOR.BLACK,
    flex: 1,
    fontSize: 16,
    paddingVertical: 6,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  opacitySlider: {
    marginBottom: 6,
    marginTop: 12,
  },
  panel: {
    flex: 1,
    height: 130,
    marginEnd: 16,
  },
  panelHueContainer: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    height: 130,
  },
  swatches: {
    justifyContent: 'flex-start',
    marginTop: 4,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: COLOR.BLUE,
    borderRadius: 10,
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  primaryButtonDisabled: {
    backgroundColor: COLOR.GRAY1,
  },
  primaryButtonText: {
    color: COLOR.WHITE,
    fontSize: 14,
  },
  deleteButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  deleteButtonText: {
    color: COLOR.DARKRED,
    fontSize: 14,
  },
  editButton: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  segment: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    paddingVertical: 8,
  },
  segmentActive: {
    backgroundColor: COLOR.BLUE,
  },
  segmentContainer: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 10,
    flexDirection: 'row',
    marginBottom: 10,
    padding: 3,
  },
  segmentLabel: {
    color: COLOR.GRAY4,
    fontSize: 13,
  },
  segmentLabelActive: {
    color: COLOR.WHITE,
    fontWeight: 'bold',
  },
  secondaryButton: {
    alignItems: 'center',
    borderRadius: 10,
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  secondaryButtonText: {
    color: COLOR.GRAY4,
    fontSize: 14,
  },
  swatch: {
    borderColor: COLOR.GRAY2,
    borderRadius: 4,
    borderWidth: 1,
    height: 18,
    marginRight: 8,
    width: 18,
  },
  title: {
    color: COLOR.BLACK,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
});
