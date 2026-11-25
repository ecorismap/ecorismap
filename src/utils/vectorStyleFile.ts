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

const NATIVE_STYLE_URL = 'style://style.json';

/**
 * 読み込んだスタイルを置いたあとの styleURL（ネイティブ）。描画は地図フォルダの style.json を読むので名前は使わない。
 * 保存済みの styleURL と同じ文字列のままだと、描画済みの画像も表示中の地図部品も作り直されず前のスタイルが残るため、
 * 読み込み直すたびに違う文字列にする（TILES-15）
 */
export const nextNativeStyleURL = (savedStyleURL: string | undefined): string => {
  if (savedStyleURL === undefined || !savedStyleURL.startsWith(NATIVE_STYLE_URL)) return NATIVE_STYLE_URL;
  const version = Number(/\?v=(\d+)$/.exec(savedStyleURL)?.[1] ?? 1);
  return `${NATIVE_STYLE_URL}?v=${version + 1}`;
};
