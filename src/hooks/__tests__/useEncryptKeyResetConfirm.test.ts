import { buildKeyResetWarning } from '../useEncryptKeyResetConfirm';

jest.mock('../../components/molecules/AlertAsync', () => ({ ResetEncryptKeyConfirmAsync: jest.fn() }));
jest.mock('../../lib/firebase/firebase', () => ({ auth: { currentUser: { uid: 'me' } } }));
jest.mock('../../lib/firebase/firestore', () => ({ countProjectsAffectedByKeyReset: jest.fn() }));
jest.mock('../../i18n/config', () => ({
  t: jest.fn((key: string, opts?: { num?: number }) => (opts?.num !== undefined ? `${key}:${opts.num}` : key)),
}));

describe('buildKeyResetWarning', () => {
  it('共有と自分だけのプロジェクトの件数を示す', () => {
    expect(buildKeyResetWarning({ shared: 12, solo: 3 }).split('\n\n')).toEqual([
      'Account.resetWarning.intro',
      'Account.resetWarning.shared:12',
      'Account.resetWarning.solo:3',
      'Account.resetWarning.retry',
    ]);
  });

  it('0件の項目は出さない', () => {
    expect(buildKeyResetWarning({ shared: 5, solo: 0 })).not.toContain('resetWarning.solo');
  });

  it('件数を取れなかったときは一般的な説明にする', () => {
    expect(buildKeyResetWarning(undefined).split('\n\n')).toEqual([
      'Account.resetWarning.intro',
      'Account.resetWarning.sharedUnknown',
      'Account.resetWarning.soloUnknown',
      'Account.resetWarning.retry',
    ]);
  });
});
