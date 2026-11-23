import { LayerType, RecordType } from '../../types';
import { FILTER_BLANK, FILTER_NOT_BLANK, filterRecords, getFieldDisplayValue, getFilterCandidates } from '../Data';

//日時列などを一覧の表示値でも絞り込める（docs/DECISIONS_2026-11.md E-L11）

const rec = (id: string, field: RecordType['field']): RecordType => ({
  id,
  userId: 'u1',
  displayName: 'u1',
  visible: true,
  redraw: false,
  coords: { latitude: 35, longitude: 139 },
  field,
});

const layer = {
  id: 'L',
  field: [
    { id: 'd', name: '日時', format: 'DATETIME' },
    { id: 's', name: '番号', format: 'SERIAL' },
  ],
} as unknown as LayerType;

const iso = '2026-11-23T10:23:45+09:00';
const records = [rec('r1', { 日時: iso, 番号: 0 }), rec('r2', { 日時: '', 番号: 2 })];

describe('filterRecords 表示値と生の値', () => {
  it('一覧に出ている表示どおりの日時で絞り込める', () => {
    const shown = getFieldDisplayValue(iso, 'DATETIME');
    expect(filterRecords(records, layer, shown, '日時').map((r) => r.id)).toEqual(['r1']);
  });

  it('これまでどおり保存されている生の値（ISO）でも絞り込める', () => {
    expect(filterRecords(records, layer, '2026-11-23T10', '日時').map((r) => r.id)).toEqual(['r1']);
  });

  it('SERIALの0は一覧で空欄なので「空白」に一致し、「空白以外」には一致しない', () => {
    expect(filterRecords(records, layer, FILTER_BLANK, '番号').map((r) => r.id)).toEqual(['r1']);
    expect(filterRecords(records, layer, FILTER_NOT_BLANK, '番号').map((r) => r.id)).toEqual(['r2']);
  });
});

describe('getFilterCandidates 表示値から作る', () => {
  it('DATETIMEの候補は秒・オフセット付きの生の値ではなく表示値', () => {
    const candidates = getFilterCandidates(
      [...records, rec('r3', { 日時: '2026-11-23T10:23:59+09:00', 番号: 3 })],
      layer,
      '日時'
    );
    expect(candidates).toEqual([getFieldDisplayValue(iso, 'DATETIME')]);
  });

  it('SERIALの0は候補に出さない', () => {
    expect(getFilterCandidates(records, layer, '番号')).toEqual(['2']);
  });
});
