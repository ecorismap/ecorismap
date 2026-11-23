import { TileMapType } from '../../types';
import { hasSharedStyle, isSharedPdfMap, mapExportNotice, prepareMapsForExport } from '../mapExport';

const TOKEN_URL = 'https://firebasestorage.googleapis.com/v0/b/x/o/projects%2Fp%2FPDF%2Fm?alt=media&token=secret';

const base = (overrides: Partial<TileMapType>): TileMapType =>
  ({
    id: 'id',
    name: 'name',
    url: 'https://example.com/{z}/{x}/{y}.png',
    attribution: '',
    visible: true,
    transparency: 0,
    overzoomThreshold: 18,
    highResolutionEnabled: false,
    minimumZ: 0,
    maximumZ: 22,
    flipY: false,
    ...overrides,
  } as TileMapType);

describe('prepareMapsForExport', () => {
  it('共有PDF（pdf://＋トークン付きURL）は地図ごと書き出さない', () => {
    const pdf = base({ id: 'pdf', name: '共有PDF', url: 'pdf://' + TOKEN_URL, encryptKey: 'key' });
    const plain = base({ id: 'plain', name: '地理院' });
    const plan = prepareMapsForExport([pdf, plain]);
    expect(plan.maps.map((m) => m.id)).toEqual(['plain']);
    expect(plan.excludedNames).toEqual(['共有PDF']);
    expect(JSON.stringify(plan.maps)).not.toContain('token=');
  });

  it('共有スタイルはスタイルと鍵だけ外し、地図本体は残す', () => {
    const styled = base({
      id: 'vec',
      name: 'ベクタ',
      url: 'pmtiles://https://example.com/a.pmtiles',
      styleURL: 'style://' + TOKEN_URL,
      encryptKey: 'key',
      isVector: true,
    });
    const plan = prepareMapsForExport([styled]);
    expect(plan.maps).toHaveLength(1);
    expect(plan.maps[0].url).toBe('pmtiles://https://example.com/a.pmtiles');
    expect('styleURL' in plan.maps[0]).toBe(false);
    expect('encryptKey' in plan.maps[0]).toBe(false);
    expect(plan.styleRemovedNames).toEqual(['ベクタ']);
  });

  it('端末内のスタイル（style://style.json）は残す', () => {
    const local = base({ styleURL: 'style://style.json' });
    const plan = prepareMapsForExport([local]);
    expect(plan.maps[0].styleURL).toBe('style://style.json');
    expect(plan.styleRemovedNames).toEqual([]);
  });

  it('どの地図からも encryptKey を除き、元の地図は変えない', () => {
    const m = base({ encryptKey: 'key' });
    const plan = prepareMapsForExport([m]);
    expect('encryptKey' in plan.maps[0]).toBe(false);
    expect(m.encryptKey).toBe('key');
  });
});

describe('判定とお知らせ', () => {
  it('isSharedPdfMap / hasSharedStyle', () => {
    expect(isSharedPdfMap(base({ url: 'pdf://' + TOKEN_URL }))).toBe(true);
    expect(isSharedPdfMap(base({ url: 'file://a.png' }))).toBe(false);
    expect(hasSharedStyle(base({ styleURL: 'style://' + TOKEN_URL }))).toBe(true);
    expect(hasSharedStyle(base({ styleURL: 'style://custom.json' }))).toBe(false);
    expect(hasSharedStyle(base({}))).toBe(false);
  });

  it('除いたものが無ければ空文字、あれば名前を並べる', () => {
    const translate = (key: string, options?: Record<string, string>) => `${key}:${options?.names ?? ''}`;
    expect(mapExportNotice({ maps: [], excludedNames: [], styleRemovedNames: [] }, translate)).toBe('');
    expect(mapExportNotice({ maps: [], excludedNames: ['A', 'B'], styleRemovedNames: ['C'] }, translate)).toBe(
      'hooks.message.mapExportExcludedSharedPdf:A\nB\n\nhooks.message.mapExportRemovedSharedStyle:C'
    );
  });
});
