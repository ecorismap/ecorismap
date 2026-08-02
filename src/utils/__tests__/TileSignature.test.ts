import {
  collectSignatureTargetUrls,
  needsResolve,
  selectUrlsToResolve,
  resolveTargets,
  signatureKeyForUrl,
  withTileSignature,
  isTileAccessDenied,
  TileSignaturesType,
} from '../TileSignature';
import { TileMapType } from '../../types';

const P = 'https://www.ecoris.co.jp/map/survey/';
const NOW = 1800000000;
const DAY = 24 * 60 * 60;

const tileMap = (over: Partial<TileMapType>): TileMapType =>
  ({
    id: 'id',
    name: 'name',
    url: '',
    attribution: '',
    maptype: 'none',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 22,
    flipY: false,
    ...over,
  } as TileMapType);

describe('collectSignatureTargetUrls', () => {
  it('タイルURLとスタイルURLの両方を集める', () => {
    const maps = [tileMap({ url: P + 'a/{z}/{x}/{y}.png', styleURL: P + 'a_塗.json' })];
    expect(collectSignatureTargetUrls(maps)).toEqual([P + 'a/{z}/{x}/{y}.png', P + 'a_塗.json']);
  });

  it('重複を除く', () => {
    const maps = [tileMap({ id: '1', url: P + 'a.pmtiles' }), tileMap({ id: '2', url: P + 'a.pmtiles' })];
    expect(collectSignatureTargetUrls(maps)).toEqual([P + 'a.pmtiles']);
  });

  it('グループはスキップする', () => {
    expect(collectSignatureTargetUrls([tileMap({ url: P + 'a.pmtiles', isGroup: true })])).toEqual([]);
  });

  it('pmtiles:// は剥がしたURLをキーにする（前置の有無で二重取得しない）', () => {
    expect(collectSignatureTargetUrls([tileMap({ url: 'pmtiles://' + P + 'a.pmtiles' })])).toEqual([P + 'a.pmtiles']);
  });

  it('pmtiles:// の有無が混在しても1件にまとまる', () => {
    const maps = [
      tileMap({ id: '1', url: 'pmtiles://' + P + 'a.pmtiles' }),
      tileMap({ id: '2', url: P + 'a.pmtiles' }),
    ];
    expect(collectSignatureTargetUrls(maps)).toEqual([P + 'a.pmtiles']);
  });

  it('ローカル・Storage経由・空のURLは対象外', () => {
    const maps = [
      tileMap({ id: '1', url: 'file:///local/{z}/{x}/{y}.png' }),
      tileMap({ id: '2', url: 'pdf://projects/x/y.pdf' }),
      tileMap({ id: '3', url: '' }),
      tileMap({ id: '4', url: 'style://local' }),
    ];
    expect(collectSignatureTargetUrls(maps)).toEqual([]);
  });

  it('立体図はDEMタイルのURLに正規化する', () => {
    const url = 'hillshade://' + P + 'dem/{z}/{x}/{y}.png#azimuth=315';
    expect(collectSignatureTargetUrls([tileMap({ url })])).toEqual([P + 'dem/{z}/{x}/{y}.png']);
  });
});

describe('signatureKeyForUrl', () => {
  it('通常のURLはそのまま', () => {
    expect(signatureKeyForUrl(P + 'a.pmtiles')).toBe(P + 'a.pmtiles');
  });

  it('立体図はプレフィックスとハッシュを落とす', () => {
    expect(signatureKeyForUrl('hillshade://' + P + 'dem/{z}/{x}/{y}.png#a=1')).toBe(P + 'dem/{z}/{x}/{y}.png');
  });

  it('pmtiles:// を落とす', () => {
    expect(signatureKeyForUrl('pmtiles://' + P + 'a.pmtiles')).toBe(P + 'a.pmtiles');
  });
});

describe('needsResolve', () => {
  it('未取得なら要求する', () => {
    expect(needsResolve(undefined, NOW)).toBe(true);
  });

  it('署名済みで期限に余裕があれば要求しない', () => {
    expect(needsResolve({ status: 'signed', query: 'q', expires: NOW + 90 * DAY, checkedAt: NOW }, NOW)).toBe(false);
  });

  it('署名済みでも期限が7日以内なら取り直す', () => {
    expect(needsResolve({ status: 'signed', query: 'q', expires: NOW + 3 * DAY, checkedAt: NOW }, NOW)).toBe(true);
  });

  it('expiresが欠けた壊れたエントリは取り直す', () => {
    expect(needsResolve({ status: 'signed', query: 'q', checkedAt: NOW }, NOW)).toBe(true);
  });

  it('署名不要は7日ごとに再確認する（サーバー追加に追随）', () => {
    expect(needsResolve({ status: 'unsigned', checkedAt: NOW - 6 * DAY }, NOW)).toBe(false);
    expect(needsResolve({ status: 'unsigned', checkedAt: NOW - 8 * DAY }, NOW)).toBe(true);
  });

  it('権限なしは1日ごとに再確認する（権限付与を早く反映）', () => {
    expect(needsResolve({ status: 'denied', checkedAt: NOW - 12 * 60 * 60 }, NOW)).toBe(false);
    expect(needsResolve({ status: 'denied', checkedAt: NOW - 2 * DAY }, NOW)).toBe(true);
  });
});

describe('selectUrlsToResolve', () => {
  it('未取得と期限切れ間近のみ返す', () => {
    const signatures: TileSignaturesType = {
      a: { status: 'signed', query: 'q', expires: NOW + 90 * DAY, checkedAt: NOW },
      b: { status: 'signed', query: 'q', expires: NOW + DAY, checkedAt: NOW },
    };
    expect(selectUrlsToResolve(['a', 'b', 'c'], signatures, NOW)).toEqual(['b', 'c']);
  });
});

describe('resolveTargets', () => {
  const fresh = { status: 'signed' as const, query: 'q', expires: NOW + 90 * DAY, checkedAt: NOW };
  const stale = { status: 'signed' as const, query: 'q', expires: NOW + DAY, checkedAt: NOW };

  it('全て新しければ何も送らない（通信しない）', () => {
    expect(resolveTargets(['a', 'b'], { a: fresh, b: fresh }, NOW)).toEqual([]);
  });

  it('1件でも期限切れがあれば全URLを送る（再確認のタイミングを揃える）', () => {
    expect(resolveTargets(['a', 'b'], { a: fresh, b: stale }, NOW)).toEqual(['a', 'b']);
  });

  it('未取得が1件あっても全URLを送る', () => {
    expect(resolveTargets(['a', 'b'], { a: fresh }, NOW)).toEqual(['a', 'b']);
  });

  it('URLが無ければ空', () => {
    expect(resolveTargets([], {}, NOW)).toEqual([]);
  });
});

describe('withTileSignature', () => {
  const signatures: TileSignaturesType = {
    [P + 'a.pmtiles']: { status: 'signed', query: 'expires=1&sig=xx', expires: NOW + 90 * DAY, checkedAt: NOW },
    [P + 'b.pmtiles']: { status: 'unsigned', checkedAt: NOW },
    [P + 'c.pmtiles']: { status: 'denied', checkedAt: NOW },
  };

  it('署名済みならクエリを付ける', () => {
    expect(withTileSignature(P + 'a.pmtiles', signatures)).toBe(P + 'a.pmtiles?expires=1&sig=xx');
  });

  it('既にクエリがあれば & で連結する', () => {
    const withQuery = P + 'a.pmtiles';
    const sigs: TileSignaturesType = { [withQuery + '?key=1']: signatures[withQuery] };
    expect(withTileSignature(withQuery + '?key=1', sigs)).toBe(withQuery + '?key=1&expires=1&sig=xx');
  });

  it('pmtiles:// を前置して引いても署名が当たり、前置は保たれる', () => {
    // Home.web.tsx が maplibre に渡すためにpmtiles://を足してから引くケース
    expect(withTileSignature('pmtiles://' + P + 'a.pmtiles', signatures)).toBe(
      'pmtiles://' + P + 'a.pmtiles?expires=1&sig=xx'
    );
  });

  it('署名不要・権限なし・未取得はURLをそのまま返す', () => {
    expect(withTileSignature(P + 'b.pmtiles', signatures)).toBe(P + 'b.pmtiles');
    expect(withTileSignature(P + 'c.pmtiles', signatures)).toBe(P + 'c.pmtiles');
    expect(withTileSignature(P + 'unknown.pmtiles', signatures)).toBe(P + 'unknown.pmtiles');
  });

  it('立体図はDEMのキーで引く', () => {
    const demUrl = P + 'dem/{z}/{x}/{y}.png';
    const sigs: TileSignaturesType = {
      [demUrl]: { status: 'signed', query: 'expires=1&sig=xx', expires: NOW + 90 * DAY, checkedAt: NOW },
    };
    // クエリはフラグメントの手前に入る。toDemUrlを通した後も署名が残る
    expect(withTileSignature('hillshade://' + demUrl + '#a=1', sigs)).toBe(
      'hillshade://' + demUrl + '?expires=1&sig=xx#a=1'
    );
  });

  it('フラグメント付きURLでもクエリが # の手前に入る', () => {
    // 立体図以外はURL全体（フラグメント込み）がそのままキーになる
    const sigs: TileSignaturesType = {
      'https://a.example/t.pmtiles#frag': {
        status: 'signed',
        query: 'expires=1&sig=xx',
        expires: NOW + 90 * DAY,
        checkedAt: NOW,
      },
    };
    expect(withTileSignature('https://a.example/t.pmtiles#frag', sigs)).toBe(
      'https://a.example/t.pmtiles?expires=1&sig=xx#frag'
    );
  });
});

describe('isTileAccessDenied', () => {
  it('権限なしのURLだけtrue', () => {
    const signatures: TileSignaturesType = {
      a: { status: 'denied', checkedAt: NOW },
      b: { status: 'signed', query: 'q', expires: NOW + DAY, checkedAt: NOW },
    };
    expect(isTileAccessDenied('a', signatures)).toBe(true);
    expect(isTileAccessDenied('b', signatures)).toBe(false);
    expect(isTileAccessDenied(undefined, signatures)).toBe(false);
  });
});
