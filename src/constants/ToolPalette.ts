import { BRUSH, ERASER, LINETOOL, POLYGONTOOL, STAMP } from './AppConstants';
import { FeatureButtonType, ToolPaletteItemType } from '../types';

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

//植生図は面で描く。ポリゴンの手書きはペン固定なので、持ち替えるのは区分（＝色）になる。
//色を保存・表示するにはレイヤの色分けを「個別」にしておく必要がある
const vegetationPolygonItems: ToolPaletteItemType[] = [
  {
    id: 'VEGETATION_GRASS',
    label: '草地',
    icon: POLYGONTOOL.HANDWRITING_POLYGON,
    subTool: 'PEN',
    penWidth: 'PEN_THIN',
    color: { hue: 90, sat: 0.6, val: 0.8, alpha: 0.7 },
  },
  {
    id: 'VEGETATION_FOREST',
    label: '樹林',
    icon: POLYGONTOOL.HANDWRITING_POLYGON,
    subTool: 'PEN',
    penWidth: 'PEN_THIN',
    color: { hue: 130, sat: 0.7, val: 0.5, alpha: 0.7 },
  },
  {
    id: 'VEGETATION_BARE',
    label: '裸地',
    icon: POLYGONTOOL.HANDWRITING_POLYGON,
    subTool: 'PEN',
    penWidth: 'PEN_THIN',
    color: { hue: 30, sat: 0.6, val: 0.6, alpha: 0.7 },
  },
  {
    id: 'VEGETATION_WATER',
    label: '水域',
    icon: POLYGONTOOL.HANDWRITING_POLYGON,
    subTool: 'PEN',
    penWidth: 'PEN_THIN',
    color: { hue: 210, sat: 0.7, val: 0.8, alpha: 0.7 },
  },
];

/**
 * 編集レイヤ名とタブからパレットを決める。該当しなければundefinedを返し、従来のツールボタンを使う。
 * @param layerName 編集中のレイヤ名
 * @param featureType 現在のタブ（LINE/POLYGONのみパレットを持つ）
 * @param hisyouEnabled 飛翔図ツールの機能フラグ（組織アカウント限定）
 */
export const getToolPalette = (
  layerName: string | undefined,
  featureType: FeatureButtonType,
  hisyouEnabled: boolean
): ToolPaletteItemType[] | undefined => {
  if (layerName === undefined) return undefined;
  //飛翔図は線（1本＝1飛翔）、植生図は面（1面＝1区分）で描く
  if (featureType === 'LINE' && hisyouEnabled && /飛翔|hisyou/i.test(layerName)) return hisyouLineItems;
  if (featureType === 'POLYGON' && /植生|vegetation/i.test(layerName)) return vegetationPolygonItems;
  return undefined;
};
