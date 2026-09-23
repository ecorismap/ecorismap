import { calcHomeTopLayout, HOME_TOP_HEIGHTS } from '../useHomeTopLayout';

const GAP = 8;

type State = {
  hasProjectLabel: boolean;
  showProjectButtons: boolean;
  showMeasureBanner: boolean;
  showViewshedBanner: boolean;
  showVistaBanner: boolean;
  isEditingObject: boolean;
};

//その状態で実際に表示される要素の縦範囲
const visibleRanges = (state: State) => {
  const layout = calcHomeTopLayout({ ...state, topInset: 47 });
  const ranges: { name: string; top: number; bottom: number }[] = [];
  if (state.hasProjectLabel) {
    ranges.push({
      name: 'projectLabel',
      top: layout.projectLabelTop,
      bottom: layout.projectLabelTop + HOME_TOP_HEIGHTS.projectLabel,
    });
  }
  if (state.hasProjectLabel && state.showProjectButtons) {
    ranges.push({
      name: 'projectButtons',
      top: layout.projectButtonsTop,
      bottom: layout.projectButtonsTop + HOME_TOP_HEIGHTS.projectButtons,
    });
  }
  if (state.showMeasureBanner) {
    ranges.push({
      name: 'measureBanner',
      top: layout.measureBannerTop,
      bottom: layout.measureBannerTop + HOME_TOP_HEIGHTS.banner,
    });
  }
  if (state.showViewshedBanner) {
    ranges.push({
      name: 'viewshedBanner',
      top: layout.viewshedBannerTop,
      bottom: layout.viewshedBannerTop + HOME_TOP_HEIGHTS.banner,
    });
  }
  if (state.showVistaBanner) {
    ranges.push({
      name: 'vistaBanner',
      top: layout.vistaBannerTop,
      bottom: layout.vistaBannerTop + HOME_TOP_HEIGHTS.banner,
    });
  }
  //編集レイヤチップは作図タブのときだけ出る。確定バーはさらに編集中だけ
  ranges.push({
    name: 'editingLayer',
    top: layout.editingLayerTop,
    bottom: layout.editingLayerTop + HOME_TOP_HEIGHTS.editingLayer,
  });
  if (state.isEditingObject) {
    //確定バーはアイコン+文字で約48
    ranges.push({ name: 'editControl', top: layout.editControlTop, bottom: layout.editControlTop + 48 });
  }
  return ranges;
};

//6つの真偽値の全組み合わせ（64通り）を網羅する
const BOTH = [false, true];
const allStates: State[] = BOTH.flatMap((hasProjectLabel) =>
  BOTH.flatMap((showProjectButtons) =>
    BOTH.flatMap((showMeasureBanner) =>
      BOTH.flatMap((showViewshedBanner) =>
        BOTH.flatMap((showVistaBanner) =>
          BOTH.map((isEditingObject) => ({
            hasProjectLabel,
            showProjectButtons,
            showMeasureBanner,
            showViewshedBanner,
            showVistaBanner,
            isEditingObject,
          }))
        )
      )
    )
  )
);

describe('calcHomeTopLayout', () => {
  it('どの状態でも要素が重ならない（全64通り）', () => {
    const overlapping = allStates.filter((state) => {
      const ranges = visibleRanges(state);
      return ranges.some((r, i) => i > 0 && r.top < ranges[i - 1].bottom);
    });
    expect(overlapping).toEqual([]);
  });

  it('出ていない要素の分は詰める', () => {
    const none = calcHomeTopLayout({
      topInset: 0,
      hasProjectLabel: false,
      showProjectButtons: false,
      showMeasureBanner: false,
      showViewshedBanner: false,
      showVistaBanner: false,
    });
    //プロジェクト外・バナー無しでは編集レイヤチップが一番上に来る
    expect(none.editingLayerTop).toBe(10);
    expect(none.editControlTop).toBe(10 + HOME_TOP_HEIGHTS.editingLayer + GAP);

    const closed = calcHomeTopLayout({
      topInset: 0,
      hasProjectLabel: true,
      showProjectButtons: false,
      showMeasureBanner: false,
      showViewshedBanner: false,
      showVistaBanner: false,
    });
    //ボタンを閉じているときは、ボタンの高さ分は空けない
    expect(closed.editingLayerTop).toBe(10 + HOME_TOP_HEIGHTS.projectLabel + GAP);
  });

  it('プロジェクトボタンを開くと下の要素がその分下がる', () => {
    const base = {
      topInset: 0,
      hasProjectLabel: true,
      showMeasureBanner: false,
      showViewshedBanner: false,
      showVistaBanner: false,
    };
    const closed = calcHomeTopLayout({ ...base, showProjectButtons: false });
    const opened = calcHomeTopLayout({ ...base, showProjectButtons: true });
    const shift = HOME_TOP_HEIGHTS.projectButtons + GAP;
    expect(opened.projectLabelTop).toBe(closed.projectLabelTop);
    expect(opened.projectButtonsTop).toBe(closed.projectButtonsTop);
    expect(opened.editingLayerTop).toBe(closed.editingLayerTop + shift);
    expect(opened.editControlTop).toBe(closed.editControlTop + shift);
  });

  it('バナーはプロジェクトの表示に合わせて下がり、下の要素を押し下げる', () => {
    const base = { topInset: 0, showMeasureBanner: true, showViewshedBanner: true, showVistaBanner: false };
    const outside = calcHomeTopLayout({ ...base, hasProjectLabel: false, showProjectButtons: false });
    //プロジェクト外ならバナーが一番上
    expect(outside.measureBannerTop).toBe(10);
    expect(outside.viewshedBannerTop).toBe(10 + HOME_TOP_HEIGHTS.banner + GAP);
    expect(outside.editingLayerTop).toBe(10 + (HOME_TOP_HEIGHTS.banner + GAP) * 2);

    const inProject = calcHomeTopLayout({ ...base, hasProjectLabel: true, showProjectButtons: true });
    //ラベルとボタンの分だけ下がる
    const offset = HOME_TOP_HEIGHTS.projectLabel + GAP + HOME_TOP_HEIGHTS.projectButtons + GAP;
    expect(inProject.measureBannerTop).toBe(outside.measureBannerTop + offset);
    expect(inProject.editControlTop).toBe(outside.editControlTop + offset);
  });

  it('測定バナーだけのときは可視領域バナーの分を空けない', () => {
    const base = { topInset: 0, hasProjectLabel: false, showProjectButtons: false, showVistaBanner: false };
    const measureOnly = calcHomeTopLayout({ ...base, showMeasureBanner: true, showViewshedBanner: false });
    const viewshedOnly = calcHomeTopLayout({ ...base, showMeasureBanner: false, showViewshedBanner: true });
    //どちらか一方ならバナーは同じ位置
    expect(measureOnly.measureBannerTop).toBe(viewshedOnly.viewshedBannerTop);
    expect(measureOnly.editingLayerTop).toBe(viewshedOnly.editingLayerTop);
  });

  it('セーフエリアの分だけ全体が下がる', () => {
    const base = {
      hasProjectLabel: true,
      showProjectButtons: true,
      showMeasureBanner: true,
      showViewshedBanner: true,
      showVistaBanner: false,
    };
    const zero = calcHomeTopLayout({ ...base, topInset: 0 });
    const notch = calcHomeTopLayout({ ...base, topInset: 47 });
    expect(notch.projectLabelTop - zero.projectLabelTop).toBe(47);
    expect(notch.editControlTop - zero.editControlTop).toBe(47);
  });
});
