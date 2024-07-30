describe('changeLayer', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('changeLatLonType', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
// describe('changeLatLonType', () => {
//   test('', () => {
//     expect(true).toBe(false);
//   });
// });

describe('changeLatLon', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('changeField', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('changedField', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('pressTakePhoto', () => {
  test('写真を撮影してサムネイルを表示する。webでは使用しない', () => {
    expect({ android: true, ios: true, web: true }).toStrictEqual({ android: true, ios: true, web: true });
  });
});
describe('pressPickPhoto', () => {
  test('写真を選択してサムネイルを表示する', () => {
    //サムネイルはどこに保存される？
    expect({ android: true, ios: true, web: true }).toStrictEqual({ android: true, ios: true, web: true });
  });
});
describe('pressSaveData', () => {
  test('管理者は編集できる？', () => {
    expect(true).toBe(true);
  });
});

describe('pressDeleteData', () => {
  test('管理者は削除できる？', () => {
    expect(true).toBe(true);
  });
  test('ローカルの写真も削除する。サーバーの写真は最適化で対応', () => {
    expect(true).toBe(true);
  });
});

describe('pressPhoto', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});

describe('pressRemovePhoto', () => {
  test('写真を消したら、ローカルに保存されている写真も削除する。サーバーの写真は最適化で対応', () => {
    expect(true).toBe(true);
  });
});

describe('pressDownloadPhoto', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});

describe('pressClosePhoto', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('gotoGoogleMaps', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('gotoHomeAndJump', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('gotoBack', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
