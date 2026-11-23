import { PenWidthType } from '../types';

//太さ種別→線幅(px)の対応。メモの描画・作図のプレビュー・保存で食い違わないよう1か所に置く
export const penWidthTypeToNumber = (width: PenWidthType): number => {
  switch (width) {
    case 'PEN_THIN':
      return 2;
    case 'PEN_MEDIUM':
      return 5;
    case 'PEN_THICK':
      return 10;
    case 'PEN_EXTRA_THICK':
      return 20;
    default:
      return 1;
  }
};
