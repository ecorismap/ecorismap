/**
 * 可視領域関連レイヤの定義。
 *
 * トラックレイヤ(id:'track')と同様の固定IDレイヤだが、常設ではなく
 * オンデマンドで作成する。可視領域を実際に作成した端末ではuseViewshedが、
 * 可視領域データを受信した端末ではuseRepositoryのcreateMergedDataSetが
 * テンプレートから補完する。お試しで作らない限りプロジェクトのレイヤ構成に
 * 影響しないようにするための方式（プロジェクト中は削除も可能。LayerEdit参照）。
 * データはpermission=PRIVATEで(userId, layerId)単位に保存されるため、
 * 複数メンバーが同時に作成・送信しても書き込みは衝突しない。
 *
 * フィールドIDは固定文字列にしている: 端末ごとにIDが変わると、管理者間で
 * プロジェクト設定を保存するたびに差分が出るため。レコードの値はフィールド名
 * キーで保持されるのでIDの違いはデータに影響しない。
 */
import { DataType, LayerType } from '../types';
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

const viewshedLayerTemplates: ReadonlyArray<[string, () => LayerType]> = [
  [VIEWSHED_LAYER_ID, createViewshedLayer],
  [VIEWSHED_CIRCLE_LAYER_ID, createViewshedCircleLayer],
  [VIEWSHED_POINT_LAYER_ID, createViewshedPointLayer],
];

/**
 * 受信データに含まれる可視領域関連レイヤIDのうち、レイヤ一覧に未登録のものを
 * テンプレートから作成して返す。データを受信したときだけ補完することで、
 * 可視領域を使っていないプロジェクトのレイヤ構成に影響を与えない。
 */
export const missingViewshedLayers = (layers: LayerType[], dataLayerIds: string[]): LayerType[] =>
  viewshedLayerTemplates
    .filter(([id]) => dataLayerIds.includes(id) && !layers.some((l) => l.id === id))
    .map(([, create]) => create());

/**
 * 可視領域を表示中のときに追加する標高タイルの出典表記。
 * 国土地理院コンテンツ利用規約は出典の記載と「編集・加工した旨」の記載を求めており、
 * 可視領域は標高タイルの加工物にあたるため、表示中は地図の出典に併記する。
 * 国外はTerrain Tiles（AWS Open Data）へフォールバックするので、そちらも併記する。
 *
 * @returns 出典文字列。可視領域が表示されていなければundefined
 */
export const getViewshedAttribution = (layers: LayerType[], polygonDataSet: DataType[]): string | undefined => {
  const layer = layers.find((l) => l.id === VIEWSHED_LAYER_ID);
  if (layer === undefined || !layer.visible) return undefined;
  const hasData = polygonDataSet.some(
    (d) => d.layerId === VIEWSHED_LAYER_ID && d.data.some((record) => record.visible && !record.deleted)
  );
  return hasData ? t('common.demAttribution') : undefined;
};
