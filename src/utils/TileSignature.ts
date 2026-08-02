import { TileMapType } from '../types';
import { isShadingUrl, toDemUrl } from './terrainShading';

// 署名付きタイル配信のクライアント側ヘルパー（純粋関数）。
//
// どのURLが署名を要するかを判断するのはFunctions側で、アプリはサーバーのプレフィックスを
// 一切知らない。アプリは「持っているURLを全部渡して、返ってきた分類を保持する」だけ。
// これにより他組織がサーバーを増やしてもアプリの更新が不要になる。
// 詳細は server/survey-tile-gateway/README.md を参照。

export type TileSignatureStatus = 'signed' | 'unsigned' | 'denied';

export interface TileSignatureType {
  status: TileSignatureStatus;
  // signed のときのみ。"expires=..&sig=.." の形
  query?: string;
  // signed のときのみ。署名の有効期限(UNIX秒)
  expires?: number;
  // 最後にFunctionsへ問い合わせた時刻(UNIX秒)
  checkedAt: number;
}

export type TileSignaturesType = { [url: string]: TileSignatureType };

// 署名の期限がこれ以下に近づいたら取り直す
const RENEW_MARGIN_SEC = 7 * 24 * 60 * 60;
// 署名不要と判定されたURLの再確認間隔（サーバーが増えた場合に追随するため）
const UNSIGNED_REVALIDATE_SEC = 7 * 24 * 60 * 60;
// 権限が無いと判定されたURLの再確認間隔（権限が付与されたら早めに反映する）
const DENIED_REVALIDATE_SEC = 24 * 60 * 60;

export const nowSec = (): number => Math.floor(Date.now() / 1000);

// 署名のキーは「実際にアクセスするURL」に正規化する。
//
// - pmtiles:// : 保存形式に付いていたり、maplibreに渡すために呼び出し側で前置したりする。
//   どちらで引いても同じ署名に当たるよう剥がす。
// - hillshade:// : 実際には剥がした後のDEMタイルURLへアクセスするのでそちらに揃える。
//   ダウンロード側も toDemUrl の結果で引く。
export const signatureKeyForUrl = (url: string): string => {
  const bare = url.startsWith('pmtiles://') ? url.slice('pmtiles://'.length) : url;
  return isShadingUrl(bare) ? toDemUrl(bare) : bare;
};

// ローカルのファイルや、Firebase Storage経由のPDF(pdf://)は問い合わせても意味がない
const isRemoteHttpUrl = (url: string | undefined): url is string => {
  if (!url) return false;
  const bare = url.startsWith('pmtiles://') ? url.slice('pmtiles://'.length) : url;
  return bare.startsWith('http://') || bare.startsWith('https://');
};

// tileMapsから問い合わせ対象のURLを集める。タイル本体とスタイルは別レイヤ扱いなので両方返す。
export const collectSignatureTargetUrls = (tileMaps: TileMapType[]): string[] => {
  const urls: string[] = [];
  const push = (url: string | undefined) => {
    if (!url) return;
    const key = signatureKeyForUrl(url);
    if (isRemoteHttpUrl(key)) urls.push(key);
  };
  tileMaps.forEach((tileMap) => {
    if (tileMap.isGroup) return;
    push(tileMap.url);
    push(tileMap.styleURL);
  });
  return Array.from(new Set(urls));
};

export const needsResolve = (entry: TileSignatureType | undefined, now: number): boolean => {
  if (!entry) return true;
  switch (entry.status) {
    case 'signed':
      // expiresが無い壊れたエントリは取り直す
      return entry.expires === undefined || now >= entry.expires - RENEW_MARGIN_SEC;
    case 'unsigned':
      return now - entry.checkedAt > UNSIGNED_REVALIDATE_SEC;
    case 'denied':
      return now - entry.checkedAt > DENIED_REVALIDATE_SEC;
    default:
      return true;
  }
};

export const selectUrlsToResolve = (urls: string[], signatures: TileSignaturesType, now: number): string[] =>
  urls.filter((url) => needsResolve(signatures[url], now));

// 実際にFunctionsへ送るURL。1件でも期限切れがあれば「全部」送る。
//
// 同じ応答で解決したURLはcheckedAtが揃うのでまとめて期限が来て1回の呼び出しで済むが、
// 後から追加したレイヤは別のcheckedAtを持つため、放っておくと再確認のタイミングが
// 分裂して呼び出し回数が増える。毎回まとめて送り直せばタイミングが再同期される。
// 呼び出し回数は変わらず（どちらも1回）、ペイロードが少し増えるだけ。
export const resolveTargets = (urls: string[], signatures: TileSignaturesType, now: number): string[] =>
  selectUrlsToResolve(urls, signatures, now).length > 0 ? urls : [];

// 署名を付けたURLを返す。署名不要・未解決・権限なしのURLはそのまま返す。
// 呼び出し側で分岐を書かなくて済むよう、常に文字列を返す。
export const withTileSignature = (url: string, signatures: TileSignaturesType): string => {
  const entry = signatures[signatureKeyForUrl(url)];
  if (!entry || entry.status !== 'signed' || !entry.query) return url;
  // 立体図(hillshade://...#azimuth=315)のようにフラグメントを持つURLがあるため、
  // クエリは必ず # の手前に入れる。末尾に足すとフラグメントの一部になって効かない。
  const hash = url.indexOf('#');
  const base = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? '' : url.slice(hash);
  // 既にクエリが付いているURL（APIキー付きタイル等）にも対応する
  const separator = base.indexOf('?') !== -1 ? '&' : '?';
  return base + separator + entry.query + fragment;
};

// 「署名が要るのに権限が無い」URLかどうか。表示側でエラーを出し分けるのに使う。
export const isTileAccessDenied = (url: string | undefined, signatures: TileSignaturesType): boolean =>
  url !== undefined && signatures[url]?.status === 'denied';
