import { ArrowStyleType, LayerType, PenWidthType } from '../types';

export type PenSettingsType = { penColor: string; currentPenWidth: PenWidthType; arrowStyle: ArrowStyleType };

//控えが無いとき（起動時から飛翔図だった等）に戻す既定値。従来のリセットと同じ
export const DEFAULT_PEN_SETTINGS: PenSettingsType = {
  penColor: 'rgba(0,0,0,0.7)',
  currentPenWidth: 'PEN_MEDIUM',
  arrowStyle: 'NONE',
};

/**
 * 編集レイヤが変わったときの、飛翔図パレットのペン設定の控えと戻し先（作図監査 E-L10）。
 * - 飛翔図へ入ったら、パレットが焼き込む前の設定（今の設定）を控える。飛翔図どうしの持ち替えでは最初の控えを保つ
 * - 飛翔図から離れたら控えへ戻す。既定値へ戻すとメモで選んでいた色・太さ・矢印まで消えるため。
 *   パレットを使っていなければ控えと今の設定が同じなので、戻しても何も変わらない
 */
export const nextHisyouPenState = (
  prevPalette: LayerType['toolPalette'] | undefined,
  nextPalette: LayerType['toolPalette'] | undefined,
  current: PenSettingsType,
  saved: PenSettingsType | undefined
): { saved: PenSettingsType | undefined; restore: PenSettingsType | undefined } => {
  const wasHisyou = prevPalette === 'HISYOU';
  const isHisyou = nextPalette === 'HISYOU';
  if (isHisyou && !wasHisyou) return { saved: current, restore: undefined };
  if (wasHisyou && !isHisyou) return { saved: undefined, restore: saved ?? DEFAULT_PEN_SETTINGS };
  return { saved, restore: undefined };
};
