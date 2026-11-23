import { buildOpenFailedMessage, buildOpenReplaceConfirmMessage, hasLocalRecords } from '../projectOpenGuard';
import { DataType } from '../../types';
import ja from '../../i18n/ja/translation.json';
import en from '../../i18n/en/translation.json';

jest.mock('../../i18n/config', () => ({ t: jest.fn((key: string) => key) }));

const data = (deleted: boolean[]): DataType[] =>
  [{ layerId: 'l', userId: 'u', data: deleted.map((d, i) => ({ id: `r${i}`, deleted: d })) }] as unknown as DataType[];

describe('hasLocalRecords（A-L2）', () => {
  it('削除済みでない記録が1件でもあれば true', () => {
    expect(hasLocalRecords(data([true, false]))).toBe(true);
  });
  it('削除済みだけ・空なら false', () => {
    expect(hasLocalRecords(data([true]))).toBe(false);
    expect(hasLocalRecords([])).toBe(false);
  });
});

describe('buildOpenReplaceConfirmMessage（A-L2）', () => {
  it('ネイティブは自動バックアップから戻せる、Web は戻せないと書き分ける', () => {
    expect(buildOpenReplaceConfirmMessage(false)).toBe('ProjectEdit.confirm.replaceLocalData');
    expect(buildOpenReplaceConfirmMessage(true)).toBe('ProjectEdit.confirm.replaceLocalDataWeb');
    expect(ja.ProjectEdit.confirm.replaceLocalData).toMatch(/バックアップから復元/);
    expect(ja.ProjectEdit.confirm.replaceLocalDataWeb).toMatch(/戻せません/);
    expect(en.ProjectEdit.confirm.replaceLocalDataWeb).toMatch(/cannot be brought back/);
  });
});

describe('buildOpenFailedMessage（A-H2）', () => {
  it('「閉じた」に失敗理由を添える', () => {
    expect(buildOpenFailedMessage('net')).toBe('ProjectEdit.alert.openFailedClosed\nnet');
    expect(buildOpenFailedMessage('')).toBe('ProjectEdit.alert.openFailedClosed');
  });
});
