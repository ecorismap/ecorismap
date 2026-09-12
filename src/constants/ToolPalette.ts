import { BRUSH, ERASER, LINETOOL, STAMP } from './AppConstants';
import { FeatureButtonType, FeatureType, LayerType, ToolPaletteItemType, ToolPaletteType } from '../types';

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

//飛翔図（猛禽類調査）。飛翔線を引きながら行動記号（ブラシ）ととまり（スタンプ）へ行き来する
const hisyouLineItems: ToolPaletteItemType[] = [
  {
    id: 'HISYOU_PEN',
    label: '飛翔',
    icon: LINETOOL.HANDWRITING_LINE,
    subTool: 'PEN',
    penWidth: 'PEN_MEDIUM',
    arrowStyle: 'ARROW_END',
  },
  { id: 'HISYOU_SENKAI', label: '旋回', icon: BRUSH.SENKAI, subTool: 'SENKAI' },
  { id: 'HISYOU_SENJYOU', label: '旋上', icon: BRUSH.SENJYOU, subTool: 'SENJYOU' },
  { id: 'HISYOU_KYUKOKA', label: '急降下', icon: BRUSH.KYUKOKA, subTool: 'KYUKOKA' },
  { id: 'HISYOU_TOMARI', label: 'とまり', icon: STAMP.TOMARI, subTool: 'TOMARI' },
  //飛翔図は1本＝1飛翔なので、消すときは軌跡ごと消す
  { id: 'HISYOU_ERASER', label: '消しゴム', icon: ERASER.ERASER, subTool: 'PEN', eraser: 'PEN_ERASER' },
];

/**
 * 区分（カテゴリ）を選ぶパレット。植生図のように区分が多く、調査ごとに中身が変わるものは
 * コードに直書きせず、色分けに使うフィールドの選択肢から作る。
 * ボタンは「次に描くオブジェクトの区分」を決めるだけで、描き方（手書き／プロット）は従来のツールで選ぶ
 */
const getCategoryPalette = (layer: LayerType): ToolPaletteItemType[] | undefined => {
  if (layer.colorStyle.colorType !== 'CATEGORIZED') return undefined;
  const field = layer.field.find((f) => f.name === layer.colorStyle.fieldName);
  if (field?.list === undefined || field.list.length === 0) return undefined;
  return field.list
    .filter((item) => !item.isOther && item.value !== '')
    .map((item) => ({
      id: item.value,
      label: item.value,
      //区分は色で見分けるので、アイコンは色を置くだけの丸にする
      icon: 'checkbox-blank-circle',
      fieldValue: item.value,
      colorHex: layer.colorStyle.colorList.find((c) => c.value === item.value)?.color,
    }));
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
  if (layer.toolPalette === 'HISYOU' && featureType === 'LINE' && hisyouEnabled) return hisyouLineItems;
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
