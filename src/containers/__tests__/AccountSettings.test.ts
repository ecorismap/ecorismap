describe('pressUpdateUserProfile', () => {
  test('表示名を変更したら反映される', () => {
    expect(true).toBe(true);
  });
  test('画像URLを変更したら反映される', () => {
    expect(true).toBe(true);
  });
  test('存在しない画像URLを指定したら無視する', () => {
    expect(true).toBe(true);
  });
});
describe('pressChangeUserPassword', () => {
  test('変更前のパスワードが違うと変更できない', () => {
    expect(true).toBe(true);
  });
});
describe('pressChangeEncryptPassword', () => {
  test('変更前のパスワードが違うと変更できない。リセットのメッセージを表示する。', () => {
    expect(true).toBe(true);
  });
});
describe('pressResetEncryptKey', () => {
  test('ログインパスワードを求められる。リセットすると暗号化パスワードの再登録を求められる。登録するとログアウトする。', () => {
    expect(true).toBe(true);
  });
  test('登録をやめるとログアウト、再ログイン時にバックアップがなければ要求する', () => {
    expect(true).toBe(true);
  });
});
describe('pressDeleteUserAccount', () => {
  test('ログインパスワードを求められ正しければ、自分がオーナーのプロジェクトをすべて削除して、ローカルキー、バックアップを削除して、公開鍵をunregistする', () => {
    expect(true).toBe(true);
  });
});
describe('pressUpgradeAccount', () => {
  test('', () => {
    expect(true).toBe(false);
  });
});

describe('アップグレード', () => {
  test('', () => {
    expect(true).toBe(false);
  });
});

describe('pressDeleteAllProjects', () => {
  test('ログインパスワードを求められて削除する', () => {
    expect(true).toBe(true);
  });
  test('プロジェクトに入っていると削除できない', () => {
    expect(true).toBe(true);
  });
});

describe('プロジェクトのバックアップ', () => {
  test('', () => {
    expect(true).toBe(false);
  });
});
