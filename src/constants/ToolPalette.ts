import { BRUSH, LINETOOL, STAMP } from './AppConstants';
import { FeatureButtonType, FeatureType, FieldType, LayerType, ToolPaletteItemType, ToolPaletteType } from '../types';

/**
 * 編集レイヤの用途ごとのツールパレット。
 *
 * 手書きの道具（ペン・スタンプ・ブラシ）は「道具を選ぶ」→「種別を設定する」の2段階になっていて、
 * 持ち替えのたびに展開とモーダルを挟む。1本の軌跡を描く間に何度も持ち替える調査では
 * これが操作コストの大半を占めるため、設定を焼き込んだボタンを並べて1タップで切り替えられるようにする。
 *
 * 1回の調査で実際に使う道具は5〜6個なので、種別を全部並べる必要はなく常時展開できる。
 *
 * TODO(tmizu23): 試作段階のためレイヤ名で判定している。使用感を確認したらレイヤ設定に持たせて
 * プリセットZIPへ同梱できるようにする。
 */

//飛翔図の行動範囲（ブラシ）。線に沿ってなぞる行動
const hisyouBrushOptions: ToolPaletteItemType[] = [
  { id: 'SENKAI', label: '旋回', icon: BRUSH.SENKAI, subTool: 'SENKAI' },
  { id: 'SENJYOU', label: '旋上', icon: BRUSH.SENJYOU, subTool: 'SENJYOU' },
  { id: 'KYUKOKA', label: '急降下', icon: BRUSH.KYUKOKA, subTool: 'KYUKOKA' },
  { id: 'DISPLAY1', label: '誇示単発', icon: BRUSH.DISPLAY1, subTool: 'DISPLAY1' },
  { id: 'DISPLAY2', label: '誇示連続', icon: BRUSH.DISPLAY2, subTool: 'DISPLAY2' },
  { id: 'KOUGEKI', label: '排斥', icon: BRUSH.KOUGEKI, subTool: 'KOUGEKI' },
  { id: 'TANJI', label: '探餌', icon: BRUSH.TANJI, subTool: 'TANJI' },
  { id: 'ESA', label: '餌運搬', icon: BRUSH.ESA, subTool: 'ESA' },
  { id: 'SUZAI', label: '巣材運搬', icon: BRUSH.SUZAI, subTool: 'SUZAI' },
];

//飛翔図の行動位置（スタンプ）。1点で示す行動
const hisyouStampOptions: ToolPaletteItemType[] = [
  { id: 'TOMARI', label: 'とまり', icon: STAMP.TOMARI, subTool: 'TOMARI' },
  { id: 'KARI', label: '狩り', icon: STAMP.KARI, subTool: 'KARI' },
  { id: 'HOVERING', label: 'ホバリング', shortLabel: 'ホバ', icon: STAMP.HOVERING, subTool: 'HOVERING' },
  { id: 'KOUBI', label: '交尾', icon: STAMP.KOUBI, subTool: 'KOUBI' },
  { id: 'VOICE', label: '声のみ', icon: STAMP.VOICE, subTool: 'VOICE' },
];

//飛翔図で事前に選ぶ属性。1本＝1個体の連続追跡なので、描く前に決めて線とその行動記号へ入れる。
//色は種名で決める（色分けのフィールド）。名前と選択肢は猛禽類野帳に合わせている。
//aliasesは改名前の名前。旧名で作ったレイヤでもボタンが出るようにする
export const HISYOU_FIELDS: { name: string; values: string[]; aliases?: string[] }[] = [
  { name: '種名', values: [] },
  //並びは選ぶ頻度の高い順。「不明」は選び間違えないよう最後に置く
  { name: '性別', values: ['雄', '雌', '不明'], aliases: ['雌雄'] },
  { name: '齢', values: ['成鳥', '若鳥', '幼鳥', '不明'], aliases: ['成幼'] },
];

//飛翔図の属性フィールドを名前で引く。フィールド名はユーザーが変えられるので、旧名も見る
export const findHisyouField = (
  fields: FieldType[],
  item: { name: string; aliases?: string[] }
): FieldType | undefined => fields.find((f) => f.name === item.name || (item.aliases ?? []).includes(f.name));

/**
 * 飛翔図（猛禽類調査）のパレット。
 * 飛翔線を引きながら、行動範囲（ブラシ）と行動位置（スタンプ）へ持ち替える。
 * 種名・性別・齢は描く前に選び、線にも行動記号にも同じ値が入る
 */
const getHisyouPalette = (layer: LayerType): ToolPaletteItemType[] => {
  //選択肢がまだ空でもボタンは出す（選択肢はモーダルからその場で足せる）
  const fieldOptions = HISYOU_FIELDS.flatMap((item) => {
    const field = findHisyouField(layer.field, item);
    if (field?.list === undefined) return [];
    //ラベルは実際のフィールド名にする（旧名のレイヤは旧名のまま出す）
    return [{ id: `HISYOU_FIELD_${field.name}`, label: field.name, icon: 'bird', fieldName: field.name }];
  });
  //種名・性別・齢はボタン1つにまとめ、モーダルのタブで切り替える。
  //未選択のときは何を押すボタンか分かるよう「種名選択」と出す（選ぶと種名がラベルになる）
  const fieldItems =
    fieldOptions.length === 0 ? [] : [{ id: 'HISYOU_FIELDS', label: '種名選択', icon: 'bird', options: fieldOptions }];

  //並びは記録の手順どおり。まず種名などを選び、飛翔線を描き、その線に行動を足していく
  return [
    ...fieldItems,
    {
      id: 'HISYOU_PEN',
      label: '飛翔',
      icon: LINETOOL.HANDWRITING_LINE,
      subTool: 'PEN',
      penWidth: 'PEN_MEDIUM',
      arrowStyle: 'ARROW_END',
    },
    //とまりや声のみは飛翔を追えていなくても記録したいことがあるので、線が無くても置ける。
    //編集中の線があれば従来どおりその線に紐づき、無ければ事前選択の属性を持つ単独のレコードになる
    {
      id: 'HISYOU_STAMP',
      label: '行動位置',
      icon: 'circle-medium',
      options: hisyouStampOptions,
      allowWithoutObject: true,
    },
    //行動範囲は線に沿ってなぞるので、編集中の線が要る
    { id: 'HISYOU_BRUSH', label: '行動範囲', icon: 'ray-start-end', options: hisyouBrushOptions },
    //行動記号だけを消す。飛翔線そのものは消さない（線を消すときは編集選択から削除する）
    { id: 'HISYOU_ERASER', label: '行動削除', icon: 'circle-off-outline', subTool: 'ERASER' },
  ];
};

/**
 * 属性の選択肢をパレットの項目にする。値は調査ごとに変わるのでコードに直書きせず、
 * レイヤのフィールドの選択肢から作る。色分けに使うフィールドなら色も引く
 */
export const getFieldOptions = (layer: LayerType, fieldName: string): ToolPaletteItemType[] => {
  const field = layer.field.find((f) => f.name === fieldName);
  if (field?.list === undefined) return [];
  return field.list
    .filter((item) => !item.isOther && item.value !== '')
    .map((item) => ({
      id: item.value,
      label: item.value,
      //値は色で見分けるので、アイコンは色を置くだけの丸にする
      icon: 'checkbox-blank-circle',
      fieldName,
      fieldValue: item.value,
      //選択肢のコード。レイヤ設定で「コードの入れ先」を決めてあれば、選ぶだけでそのフィールドへ入る
      fieldCode: item.customFieldValue,
      colorHex:
        fieldName === layer.colorStyle.fieldName
          ? layer.colorStyle.colorList.find((c) => c.value === item.value)?.color
          : undefined,
    }));
};

/**
 * 区分（カテゴリ）を選ぶパレット。植生図は区分ボタン1つで、押すと選択肢から選ぶ。
 * 区分は「次に描くオブジェクトの区分」を決めるだけで、描き方（手書き／プロット）は従来のツールで選ぶ
 */
const getCategoryPalette = (layer: LayerType): ToolPaletteItemType[] | undefined => {
  if (layer.colorStyle.colorType !== 'CATEGORIZED') return undefined;
  const fieldName = layer.colorStyle.fieldName;
  //選択肢がまだ空でもボタンは出す（区分はモーダルからその場で足せる）
  const field = layer.field.find((f) => f.name === fieldName);
  if (field?.list === undefined) return undefined;
  return [{ id: `FIELD_${fieldName}`, label: fieldName, icon: 'checkbox-blank-circle', fieldName }];
};

/**
 * レイヤの用途とタブからパレットを決める。該当しなければundefinedを返し、従来のツールボタンを使う。
 * @param layer 編集中のレイヤ（用途・色分け・フィールドから組み立てる）
 * @param featureType 現在のタブ（LINE/POLYGONのみパレットを持つ）
 * @param hisyouEnabled 飛翔図ツールの機能フラグ
 */
export const getToolPalette = (
  layer: LayerType | undefined,
  featureType: FeatureButtonType,
  hisyouEnabled: boolean
): ToolPaletteItemType[] | undefined => {
  if (layer === undefined) return undefined;
  //飛翔図は道具（ペン・ブラシ・スタンプ）を持ち替える。植生図は区分を持ち替える
  if (layer.toolPalette === 'HISYOU' && featureType === 'LINE' && hisyouEnabled) return getHisyouPalette(layer);
  if (layer.toolPalette === 'VEGETATION' && featureType === 'POLYGON') return getCategoryPalette(layer);
  return undefined;
};

/**
 * そのレイヤの用途がツールパレットを持つ（＝ストロークごとに色を変える）か。
 * 色分けの「個別（_strokeColor）」はこの用途のためにある
 */
export const hasToolPalette = (
  toolPalette: ToolPaletteType | undefined,
  featureType: FeatureType,
  hisyouEnabled: boolean
): boolean => {
  if (toolPalette === 'HISYOU') return featureType === 'LINE' && hisyouEnabled;
  if (toolPalette === 'VEGETATION') return featureType === 'POLYGON';
  return false;
};
