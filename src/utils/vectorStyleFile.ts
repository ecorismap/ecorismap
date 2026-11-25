/**
 * 取り込むスタイルJSONの確認と読み出し。
 * layers を持つスタイル全体と、layers の配列だけのファイル（Android の既定スタイルの形）を受け付ける。
 * どちらでもなければ undefined（壊れたファイルを保存すると、エラーも出ないまま地図が消えるため取り込まない）
 */
export const parseStyleLayers = (json: string): unknown[] | undefined => {
  try {
    const parsed: unknown = JSON.parse(json.replace(/^﻿/, ''));
    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { layers } = parsed as { layers?: unknown };
    return Array.isArray(layers) ? layers : undefined;
  } catch {
    return undefined;
  }
};
