import { TileMapType } from '../types';

/**
 * プロジェクトで共有された PDF 地図か。url は pdf://＋Storage のトークン付きダウンロード URL で、
 * encryptKey と組み合わせると Rules を通らずに取得・復号できてしまう。
 */
export const isSharedPdfMap = (tileMap: TileMapType): boolean => tileMap.url.startsWith('pdf://');

/** プロジェクトで共有されたスタイル（style://＋トークン付き URL）か。端末内のスタイル（style://style.json 等）は除く */
export const hasSharedStyle = (tileMap: TileMapType): boolean =>
  tileMap.styleURL !== undefined && /^style:\/\/https?:\/\//.test(tileMap.styleURL);

export type MapExportPlan = {
  maps: TileMapType[];
  /** 書き出さなかった地図（共有 PDF） */
  excludedNames: string[];
  /** スタイルを外して書き出した地図（共有スタイル） */
  styleRemovedNames: string[];
};

/**
 * 地図設定の JSON 書き出し用に、共有の鍵とトークン付き URL を除く（M-L14）。
 * 共有 PDF は URL と鍵が地図の中身そのもので、除くと取り込んだ先で何も描けない地図になるので地図ごと書き出さない。
 * 共有スタイルは地図本体（公開 URL）は使えるので、スタイルだけ外して既定の見た目で書き出す。
 */
export const prepareMapsForExport = (maps: TileMapType[]): MapExportPlan => {
  const excludedNames: string[] = [];
  const styleRemovedNames: string[] = [];
  const exported: TileMapType[] = [];
  for (const tileMap of maps) {
    if (isSharedPdfMap(tileMap)) {
      excludedNames.push(tileMap.name);
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { encryptKey, ...rest } = tileMap;
    if (hasSharedStyle(tileMap)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { styleURL, ...withoutStyle } = rest;
      styleRemovedNames.push(tileMap.name);
      exported.push(withoutStyle);
    } else {
      exported.push(rest);
    }
  }
  return { maps: exported, excludedNames, styleRemovedNames };
};

/** 書き出し前に知らせる文。何も除いていなければ空文字 */
export const mapExportNotice = (plan: MapExportPlan, translate: (key: string, options?: Record<string, string>) => string): string => {
  const lines: string[] = [];
  if (plan.excludedNames.length > 0) {
    lines.push(translate('hooks.message.mapExportExcludedSharedPdf', { names: plan.excludedNames.join('\n') }));
  }
  if (plan.styleRemovedNames.length > 0) {
    lines.push(translate('hooks.message.mapExportRemovedSharedStyle', { names: plan.styleRemovedNames.join('\n') }));
  }
  return lines.join('\n\n');
};
