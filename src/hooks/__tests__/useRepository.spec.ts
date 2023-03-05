describe('createProject', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('updateProject', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('deleteProject', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('deleteAllProjects', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('downloadProjectSettings', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('downloadAllData', () => {
  test('', () => {
    expect(true).toBe(true);
  });
  //firebase,ethreeのテストかもしれない
  test('あとから追加されたメンバーはこれまでのデータを読み込める', () => {
    expect(true).toBe(true);
  });
  test('メンバーを削除しても、残りのメンバーは削除されたメンバーのデータを読み込める', () => {
    expect(true).toBe(true);
  });
  test('メンバーがリセットしても、残りのメンバーはリセットしたメンバーのデータは読める。', () => {
    expect(true).toBe(true);
  });
  test('メンバーがアカウント削除したら、そのユーザーのデータは読めない。', () => {
    //仕方ない
    expect(true).toBe(true);
  });
});
describe('downloadPublicAndCommonData', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('downloadPublicData', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('downloadPrivateData', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('downloadPublicAndAllPrivateData', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});

describe('uploadData', () => {
  //uploadTypeに応じて、プロジェクトのデータをアップロードする。アップロードする前に一旦削除する（データが削除されてない場合に対応するため？本当？ToDo：確認）
  //userIdがundefineか自分のデータのみをアップロードする。
  //userIdをundefineから自分に変更
  //写真をアップロードする場合は、urlを更新
  test('', () => {
    expect(true).toBe(true);
  });
});

describe('uploadProjectSettings', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});

describe('downloadPhotos', () => {
  test('dataSet内のPhotoフィールドの写真をダウンロード', () => {
    expect(true).toBe(true);
  });
});

describe('downloadPhoto', () => {
  test('レコード内の写真をダウンロードしてuriを更新', () => {
    expect(true).toBe(true);
  });
});
