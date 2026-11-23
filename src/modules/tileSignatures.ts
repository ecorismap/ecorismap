import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { needsResolve, TileSignaturesType, TileSignatureType } from '../utils/TileSignature';

// 署名付きタイル配信の署名キャッシュ。キーはタイル/スタイル/PDFのURL。
// persist:rootに含まれるので、オフライン起動時も前回の結果がそのまま使える。

export const tileSignaturesInitialState: TileSignaturesType = {};

export interface TileSignaturesResponse {
  // 問い合わせたURL。応答に含まれないURLを取りこぼさないために必要
  requested: string[];
  signatures: { [url: string]: string };
  unsigned: string[];
  denied: string[];
  expires: number;
  checkedAt: number;
}

const reducers = {
  // Functionsの応答をマージする。requestedにあって応答に無いURLは denied 扱いにする
  // （取りこぼすと同期フックが毎回同じURLを問い合わせ続けてしまう）。
  mergeTileSignaturesAction: (state: TileSignaturesType, action: PayloadAction<TileSignaturesResponse>) => {
    const { requested, signatures, unsigned, denied, expires, checkedAt } = action.payload;
    const resolved: TileSignaturesType = {};
    unsigned.forEach((url) => {
      resolved[url] = { status: 'unsigned', checkedAt };
    });
    denied.forEach((url) => {
      resolved[url] = { status: 'denied', checkedAt };
    });
    Object.keys(signatures).forEach((url) => {
      resolved[url] = { status: 'signed', query: signatures[url], expires, checkedAt };
    });
    requested.forEach((url) => {
      const next = resolved[url] ?? { status: 'denied', checkedAt };
      const prev = state[url];
      // 問い合わせは未解決の URL が1件でもあると全 URL をまとめて送り、サーバーは毎回新しい署名を返す。
      // まだ更新の時期でない署名まで差し替えると、署名込み URL を key に持つ地図の部品（pmtileKey.ts）が
      // 地図を1つ足すたびに全部作り直される。更新の時期が来るまでは前の署名を据え置く
      if (next.status === 'signed' && prev?.status === 'signed' && prev.query && !needsResolve(prev, checkedAt)) {
        state[url] = { ...prev, checkedAt };
        return;
      }
      state[url] = next;
    });
  },
  // ログアウト時に破棄する。他人の端末に署名が残らないようにする。
  // 地図を削除しても個別には消さない。エントリは数十バイトで、消すと再取得が必要になり
  // オフライン時に不利になるため（ログアウトでまとめて消える）。
  clearTileSignaturesAction: () => {
    return {} as TileSignaturesType;
  },
};

const tileSignaturesSlice = createSlice({
  name: 'tileSignatures',
  initialState: tileSignaturesInitialState,
  reducers,
});

export const { mergeTileSignaturesAction, clearTileSignaturesAction } = tileSignaturesSlice.actions;
export default tileSignaturesSlice.reducer;
export type { TileSignatureType };
