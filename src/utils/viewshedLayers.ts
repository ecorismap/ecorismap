/**
 * 可視領域関連レイヤの定義。
 *
 * トラックレイヤ(id:'track')と同じ方式の固定IDレイヤで、プロジェクト設定に
 * なければ各クライアントがテンプレートから自動補完する（useRepositoryの
 * fetchProjectSettings/downloadProjectSettings参照）。
 * データはpermission=PRIVATEで(userId, layerId)単位に保存されるため、
 * 複数メンバーが同時に作成・送信しても書き込みは衝突しない。
 *
 * フィールドIDは固定文字列にしている: 端末ごとにIDが変わると、管理者間で
 * プロジェクト設定を保存するたびに差分が出るため。レコードの値はフィールド名
 * キーで保持されるのでIDの違いはデータに影響しない。
 */
import { LayerType } from '../types';
import { COLOR } from '../constants/AppConstants';
import { t } from '../i18n/config';

/** 可視領域レイヤ（ポリゴン・半透明塗り）の固定ID */
export const VIEWSHED_LAYER_ID = 'viewshed';
/** 範囲円レイヤ（ポリゴン・枠線のみ）の固定ID */
export const VIEWSHED_CIRCLE_LAYER_ID = 'viewshed_circle';
/** 観測点レイヤ（ポイント）の固定ID */
export const VIEWSHED_POINT_LAYER_ID = 'viewshed_center';

/** 可視領域関連の固定IDレイヤか */
export const isViewshedLayer = (layerId: string) =>
  layerId === VIEWSHED_LAYER_ID || layerId === VIEWSHED_CIRCLE_LAYER_ID || layerId === VIEWSHED_POINT_LAYER_ID;

const baseColorStyle = {
  colorType: 'SINGLE' as const,
  fieldName: '',
  customFieldValue: '',
  colorRamp: 'RANDOM' as const,
  colorList: [],
};

/** 可視領域レイヤ（ポリゴン）のテンプレート。transparency=0で半透明の赤の塗りつぶし */
export const createViewshedLayer = (): LayerType => ({
  id: VIEWSHED_LAYER_ID,
  name: t('common.viewshed'),
  type: 'POLYGON',
  permission: 'PRIVATE',
  colorStyle: { ...baseColorStyle, transparency: 0, color: 'rgba(255, 0, 0, 0.4)' },
  label: '',
  visible: true,
  active: false,
  field: [{ id: 'viewshed_no', name: t('Home.viewshed.fieldNo'), format: 'INTEGER' }],
});

/** 範囲円レイヤのテンプレート。transparencyフラグで塗りなし（枠線のみ） */
export const createViewshedCircleLayer = (): LayerType => ({
  id: VIEWSHED_CIRCLE_LAYER_ID,
  name: t('common.viewshedCircle'),
  type: 'POLYGON',
  permission: 'PRIVATE',
  colorStyle: { ...baseColorStyle, transparency: 1, color: COLOR.RED },
  label: '',
  visible: true,
  active: false,
  field: [{ id: 'viewshed_no', name: t('Home.viewshed.fieldNo'), format: 'INTEGER' }],
});

/** 観測点レイヤ（ポイント）のテンプレート。観測点Noをラベル表示する */
export const createViewshedPointLayer = (): LayerType => ({
  id: VIEWSHED_POINT_LAYER_ID,
  name: t('common.viewshedCenter'),
  type: 'POINT',
  permission: 'PRIVATE',
  colorStyle: { ...baseColorStyle, transparency: 0.2, color: COLOR.RED },
  label: t('Home.viewshed.fieldNo'),
  visible: true,
  active: false,
  field: [
    { id: 'viewshed_no', name: t('Home.viewshed.fieldNo'), format: 'SERIAL' },
    { id: 'viewshed_distance', name: t('Home.viewshed.fieldDistance'), format: 'DECIMAL' },
    { id: 'viewshed_height', name: t('Home.viewshed.fieldHeight'), format: 'DECIMAL' },
    { id: 'viewshed_elevation', name: t('Home.viewshed.fieldElevation'), format: 'DECIMAL' },
    { id: 'viewshed_remarks', name: t('Home.viewshed.fieldRemarks'), format: 'STRING' },
  ],
});

/**
 * レイヤ一覧に可視領域関連レイヤがなければテンプレートで補完する。
 * プロジェクト設定の取得時（開く時）にtrackレイヤの補完と同じ場所で使う。
 */
export const ensureViewshedLayers = (layers: LayerType[]): LayerType[] => {
  const result = [...layers];
  const templates: [string, () => LayerType][] = [
    [VIEWSHED_LAYER_ID, createViewshedLayer],
    [VIEWSHED_CIRCLE_LAYER_ID, createViewshedCircleLayer],
    [VIEWSHED_POINT_LAYER_ID, createViewshedPointLayer],
  ];
  for (const [id, create] of templates) {
    if (!result.some((l) => l.id === id)) result.push(create());
  }
  return result;
};
