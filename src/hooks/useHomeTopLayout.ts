import { useContext, useMemo, useSyncExternalStore } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeasureContext } from '../contexts/Measure';
import { ProjectContext } from '../contexts/Project';
import { ViewshedContext } from '../contexts/Viewshed';
import { terrain3dVistaStore } from '../utils/terrain3d/vistaStore';

/**
 * 地図の上部中央に重ねる要素の縦位置。
 *
 * それぞれが固定値のtopを持っていると、プロジェクトボタンを開いたときのように
 * 表示要素が増えた状態で重なる。上から順に積んで、出ていない要素の分は詰める。
 *
 * 並び順（上から）:
 *   プロジェクトラベル → プロジェクトボタン → 測定バナー → 可視領域バナー → 眺望バナー
 *   → 編集レイヤチップ → 確定・キャンセル
 * プロジェクトボタンはラベルをタップして開くものなのでラベルの直下に置き、
 * 作業中であることを示すバナーはその下、作図の操作系はさらに下に積む
 */
const TOP_MARGIN = 10;
const GAP = 8;

//各要素の高さ。中身を変えたらここも合わせる（重なり防止の計算に使う）
export const HOME_TOP_HEIGHTS = {
  //padding5 + 文字 + borderWidth1
  projectLabel: 32,
  //Buttonアトム（size20）の高さ。ラベルはボタンの中に重ねて出る
  projectButtons: 40,
  //チップの高さ
  editingLayer: 32,
  //バナー（paddingVertical8 + 文字）
  banner: 36,
} as const;

export type HomeTopLayout = {
  projectLabelTop: number;
  projectButtonsTop: number;
  measureBannerTop: number;
  viewshedBannerTop: number;
  vistaBannerTop: number;
  editingLayerTop: number;
  editControlTop: number;
};

export const calcHomeTopLayout = ({
  topInset,
  hasProjectLabel,
  showProjectButtons,
  showMeasureBanner,
  showViewshedBanner,
  showVistaBanner,
}: {
  topInset: number;
  hasProjectLabel: boolean;
  showProjectButtons: boolean;
  showMeasureBanner: boolean;
  showViewshedBanner: boolean;
  showVistaBanner: boolean;
}): HomeTopLayout => {
  let y = topInset + TOP_MARGIN;

  const projectLabelTop = y;
  if (hasProjectLabel) y += HOME_TOP_HEIGHTS.projectLabel + GAP;

  const projectButtonsTop = y;
  //ボタンはプロジェクトに入っているときだけ開ける
  if (hasProjectLabel && showProjectButtons) y += HOME_TOP_HEIGHTS.projectButtons + GAP;

  const measureBannerTop = y;
  if (showMeasureBanner) y += HOME_TOP_HEIGHTS.banner + GAP;

  const viewshedBannerTop = y;
  if (showViewshedBanner) y += HOME_TOP_HEIGHTS.banner + GAP;

  const vistaBannerTop = y;
  if (showVistaBanner) y += HOME_TOP_HEIGHTS.banner + GAP;

  const editingLayerTop = y;
  y += HOME_TOP_HEIGHTS.editingLayer + GAP;

  const editControlTop = y;

  return {
    projectLabelTop,
    projectButtonsTop,
    measureBannerTop,
    viewshedBannerTop,
    vistaBannerTop,
    editingLayerTop,
    editControlTop,
  };
};

export const useHomeTopLayout = (): HomeTopLayout => {
  const insets = useSafeAreaInsets();
  const { projectName, isShowingProjectButtons } = useContext(ProjectContext);
  const { isMeasuring } = useContext(MeasureContext);
  const { hasViewshedPreview } = useContext(ViewshedContext);
  // 眺望モードは3Dシーンが持つ状態なので外部ストアから取る（activeだけを見て、
  // 高さ変更のたびにバナー以外まで再レンダリングされないようにする）
  const isVista = useSyncExternalStore(terrain3dVistaStore.subscribe, () => terrain3dVistaStore.getSnapshot().active);

  return useMemo(
    () =>
      calcHomeTopLayout({
        topInset: insets.top,
        hasProjectLabel: projectName !== undefined,
        showProjectButtons: isShowingProjectButtons,
        showMeasureBanner: isMeasuring,
        showViewshedBanner: hasViewshedPreview,
        showVistaBanner: isVista,
      }),
    [hasViewshedPreview, insets.top, isMeasuring, isShowingProjectButtons, isVista, projectName]
  );
};
