import reducer, { mergeTileSignaturesAction, TileSignaturesResponse } from '../tileSignatures';
import { TileSignaturesType } from '../../utils/TileSignature';

const NOW = 1800000000;
const DAY = 24 * 60 * 60;
const A = 'https://www.ecoris.co.jp/map/survey/a/{z}/{x}/{y}.png';
const B = 'https://www.ecoris.co.jp/map/survey/b.pmtiles';
const GSI = 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png';

const response = (over: Partial<TileSignaturesResponse>): TileSignaturesResponse => ({
  requested: [],
  signatures: {},
  unsigned: [],
  denied: [],
  expires: NOW + 90 * DAY,
  checkedAt: NOW,
  ...over,
});

describe('mergeTileSignaturesAction', () => {
  test('応答の分類を保存し、応答に無い URL は denied にする', () => {
    const state = reducer(
      {},
      mergeTileSignaturesAction(
        response({ requested: [A, GSI, B], signatures: { [A]: 'expires=1&sig=a' }, unsigned: [GSI] })
      )
    );
    expect(state[A]).toEqual({ status: 'signed', query: 'expires=1&sig=a', expires: NOW + 90 * DAY, checkedAt: NOW });
    expect(state[GSI]).toEqual({ status: 'unsigned', checkedAt: NOW });
    expect(state[B]).toEqual({ status: 'denied', checkedAt: NOW });
  });

  // 地図を1つ足すと全 URL が問い合わせ直される。署名込み URL は地図の部品の key に入るので、
  // 更新の時期でない署名まで差し替えると保護レイヤが全部作り直される（点滅・キャッシュ喪失）
  test('まだ更新の時期でない署名は据え置き、checkedAt だけ進める', () => {
    const prev: TileSignaturesType = {
      [A]: { status: 'signed', query: 'expires=old&sig=old', expires: NOW + 60 * DAY, checkedAt: NOW - DAY },
    };
    const later = NOW + DAY;
    const state = reducer(
      prev,
      mergeTileSignaturesAction(
        response({
          requested: [A, GSI],
          signatures: { [A]: 'expires=new&sig=new' },
          unsigned: [GSI],
          expires: later + 90 * DAY,
          checkedAt: later,
        })
      )
    );
    expect(state[A]).toEqual({ status: 'signed', query: 'expires=old&sig=old', expires: NOW + 60 * DAY, checkedAt: later });
    expect(state[GSI]).toEqual({ status: 'unsigned', checkedAt: later });
  });

  test('期限が近い（7日前を切った）署名は新しい署名に差し替える', () => {
    const prev: TileSignaturesType = {
      [A]: { status: 'signed', query: 'expires=old&sig=old', expires: NOW + 3 * DAY, checkedAt: NOW - 80 * DAY },
    };
    const state = reducer(
      prev,
      mergeTileSignaturesAction(response({ requested: [A], signatures: { [A]: 'expires=new&sig=new' } }))
    );
    expect(state[A]).toEqual({ status: 'signed', query: 'expires=new&sig=new', expires: NOW + 90 * DAY, checkedAt: NOW });
  });

  test('権限を失った・署名不要になった URL は据え置かずに反映する', () => {
    const prev: TileSignaturesType = {
      [A]: { status: 'signed', query: 'q', expires: NOW + 60 * DAY, checkedAt: NOW - DAY },
      [B]: { status: 'signed', query: 'q', expires: NOW + 60 * DAY, checkedAt: NOW - DAY },
    };
    const state = reducer(prev, mergeTileSignaturesAction(response({ requested: [A, B], unsigned: [B] })));
    expect(state[A]).toEqual({ status: 'denied', checkedAt: NOW });
    expect(state[B]).toEqual({ status: 'unsigned', checkedAt: NOW });
  });
});
