/**
 * 作図監査の判断項目（docs/DECISIONS_2026-11.md の E-L8・E-L9・E-L10）の純粋関数
 */
import { arrowFragment, hasEndArrow, hasStartArrow } from '../arrowStyle';
import { toMemoZoom as toMemoZoomNative } from '../memoZoom';
import { toMemoZoom as toMemoZoomWeb } from '../memoZoom.web';
import { DEFAULT_PEN_SETTINGS, nextHisyouPenState, PenSettingsType } from '../hisyouPenRestore';
import { getLineWidthAtZoom, getMapMemoSymbolScaleAtZoom } from '../Layer';
import { LayerType, RecordType } from '../../types';

describe('E-L8 マップメモのズーム基準をGoogle基準に揃える', () => {
  it('ネイティブはそのまま、Web（maplibre）は+1する', () => {
    expect(toMemoZoomNative(15)).toBe(15);
    expect(toMemoZoomWeb(15)).toBe(16);
  });

  it('同じ縮尺なら、スマホで描いた線の太さ・記号の大きさがWebでも同じになる', () => {
    const layer = { colorStyle: { colorType: 'INDIVIDUAL', lineWidth: 1.5 } } as unknown as LayerType;
    //スマホ（Google）のズーム16で描いた線。Webの同じ縮尺はmaplibreのズーム15
    const record = { field: { _strokeWidth: 8, _zoom: 16 } } as unknown as RecordType;
    expect(getLineWidthAtZoom(layer, record, toMemoZoomWeb(15))).toBe(8);
    expect(getLineWidthAtZoom(layer, record, toMemoZoomNative(16))).toBe(8);
    //記号の基準ズーム（14）の比較も同じ縮尺で揃う
    expect(getMapMemoSymbolScaleAtZoom(toMemoZoomWeb(12))).toBe(getMapMemoSymbolScaleAtZoom(toMemoZoomNative(13)));
  });
});

describe('E-L9 部分消去した断片の矢印', () => {
  const original = [
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
  ];
  const head = [
    [0, 0],
    [1, 1],
  ];
  const middle = [
    [1.2, 1.2],
    [1.8, 1.8],
  ];
  const tail = [
    [2, 2],
    [3, 3],
  ];

  it('ARROW_END は終点を含む断片だけに残す', () => {
    expect(arrowFragment('ARROW_END', original, head)).toEqual({ style: 'NONE', positions: head });
    expect(arrowFragment('ARROW_END', original, middle)).toEqual({ style: 'NONE', positions: middle });
    expect(arrowFragment('ARROW_END', original, tail)).toEqual({ style: 'ARROW_END', positions: tail });
  });

  it('ARROW_BOTH の始点側は座標を反転して ARROW_END にする（ARROW_START を同期データへ出さない）', () => {
    expect(arrowFragment('ARROW_BOTH', original, head)).toEqual({ style: 'ARROW_END', positions: [...head].reverse() });
    expect(arrowFragment('ARROW_BOTH', original, middle)).toEqual({ style: 'NONE', positions: middle });
    expect(arrowFragment('ARROW_BOTH', original, tail)).toEqual({ style: 'ARROW_END', positions: tail });
    expect(arrowFragment('ARROW_BOTH', original, original)).toEqual({ style: 'ARROW_BOTH', positions: original });
  });

  it('既存の ARROW_START も、始点側の断片は反転して ARROW_END にする', () => {
    expect(arrowFragment('ARROW_START', original, head)).toEqual({ style: 'ARROW_END', positions: [...head].reverse() });
    expect(arrowFragment('ARROW_START', original, tail)).toEqual({ style: 'NONE', positions: tail });
  });

  it('矢印でない種別（ブラシ・空・未設定）はそのまま', () => {
    expect(arrowFragment('NONE', original, tail)).toEqual({ style: 'NONE', positions: tail });
    expect(arrowFragment('', original, tail)).toEqual({ style: '', positions: tail });
    expect(arrowFragment(undefined, original, tail)).toEqual({ style: undefined, positions: tail });
  });

  it('描く端の判定', () => {
    expect([hasStartArrow('ARROW_START'), hasEndArrow('ARROW_START')]).toEqual([true, false]);
    expect([hasStartArrow('ARROW_BOTH'), hasEndArrow('ARROW_BOTH')]).toEqual([true, true]);
    expect([hasStartArrow('ARROW_END'), hasEndArrow('ARROW_END')]).toEqual([false, true]);
  });
});

describe('E-L10 飛翔図から離れたらペン設定を入る前へ戻す', () => {
  const memoPen: PenSettingsType = { penColor: 'rgba(255,0,0,1)', currentPenWidth: 'PEN_THICK', arrowStyle: 'ARROW_BOTH' };
  const palettePen: PenSettingsType = { penColor: 'rgba(0,0,255,1)', currentPenWidth: 'PEN_MEDIUM', arrowStyle: 'ARROW_END' };

  it('入ったときの設定を控え、離れたらそれに戻す（既定値には戻さない）', () => {
    const enter = nextHisyouPenState(undefined, 'HISYOU', memoPen, undefined);
    expect(enter).toEqual({ saved: memoPen, restore: undefined });
    //パレットで焼き込んだ後に、メモタブ（編集レイヤなし）へ移る
    const leave = nextHisyouPenState('HISYOU', undefined, palettePen, enter.saved);
    expect(leave).toEqual({ saved: undefined, restore: memoPen });
  });

  it('飛翔図どうしの持ち替えでは最初の控えを保つ', () => {
    expect(nextHisyouPenState('HISYOU', 'HISYOU', palettePen, memoPen)).toEqual({ saved: memoPen, restore: undefined });
  });

  it('飛翔図に関係しない切り替えでは何もしない', () => {
    expect(nextHisyouPenState(undefined, 'VEGETATION', memoPen, undefined)).toEqual({
      saved: undefined,
      restore: undefined,
    });
  });

  it('控えが無ければ従来どおり既定値へ戻す', () => {
    expect(nextHisyouPenState('HISYOU', undefined, palettePen, undefined).restore).toEqual(DEFAULT_PEN_SETTINGS);
  });
});
