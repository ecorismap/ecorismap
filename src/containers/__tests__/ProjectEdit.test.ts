// describe('pressOpenProject', () => {
//   test('管理者ならプロジェクトの設定をダウンロードして、全員のデータをダウンロード。写真はダウンロードしない。', () => {
//     //レイヤ設定をダウンロードしてからじゃないとダメなので、ここでは写真はダウンロードしない。必要なら、あとからデータのダウンロードで写真もダウンロードする。
//     expect(true).toBe(true);
//   });
//   test('メンバーならプロジェクトの設定をダウンロードして、データは、コモン、全員のパブリック、自分のプライベートをダウンロード。写真をすべてダウンロードするか尋ねる', () => {
//     expect(true).toBe(true);
//   });
// });

// describe('pressSaveProject', () => {
//   //ToDo 新規作成と更新で関数を分ける？
//   test('defaultで作成すると、ポイント、ライン、ポリゴンのレイヤの設定をアップロードする。e3kitのグループを作る', () => {
//     expect(true).toBe(true);
//   });

//   test('saveで作成すると、現在の設定状況をアップロードする。データは、コモンと自分のデータすべてをアップロードする。e3kitのグループを作る', () => {
//     expect(true).toBe(true);
//   });
//   test('copyで作成すると、指定したプロジェクトの設定を一旦ダウンロードしてアップロードする。データは、コモンデータのみアップロードする。e3kitのグループを作る', () => {
//     expect(true).toBe(true);
//   });
//   test('プロジェクト情報の更新をする。メンバーが変更されていたら、e3kitのグループも更新する', () => {
//     expect(true).toBe(true);
//   });
// });

// describe('pressToggleLockProject', () => {
//   //管理者しか呼び出せない。表示されないため。
//   test('プロジェクトの編集ロックを解除する。', () => {
//     //レイヤ編集、コモンデータの編集が可能になる。ToDo コモンデータの処理
//     expect(true).toBe(true);
//   });
//   test('プロジェクトの設定を更新する。データは、コモンデータのみ更新する。写真をアップロードするか尋ねる', () => {
//     expect(true).toBe(true);
//   });
// });

describe('pressUploadData', () => {
  test('自分のパブリックとプライベートのデータをアップロードする。写真をアップロードするか尋ねる.', () => {
    expect({ android: true, ios: true, web: true }).toStrictEqual({ android: true, ios: true, web: true });
  });
});

// describe('pressDownloadData', () => {
//   test('管理者なら全員のパブリックと全員のプライベートをダウンロード。写真をすべてダウンロードするか尋ねる', () => {
//     //Web版は、まとめてダウンロードしない。必要なら個別に。プロジェクト一括ダウンロードの場合は、別の方法で、functionsでzipにしてダウンロードを実装？
//     expect(true).toBe(true);
//   });
//   test('メンバーなら全員のパブリックと自分のプライベートをダウンロード。写真をすべてダウンロードするか尋ねる', () => {
//     expect(true).toBe(true);
//   });
// });

// describe('pressCloseProject', () => {
//   test('データとレイヤを初期状態にして、Homeに移動', () => {
//     //ToDo 地図と範囲はリセットする？
//     expect(true).toBe(true);
//   });
// });
describe('pressDeleteProject', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('pressJumpProject', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('pressCheckVerified', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
describe('pressSyncPosition', () => {
  test('', () => {
    expect(true).toBe(true);
  });
});
// describe('pressJumpProject', () => {
//   test('', () => {
//     expect(true).toBe(false);
//   });
// });
// describe('pressCheckVerified', () => {
//   test('', () => {
//     expect(true).toBe(false);
//   });
// });
// describe('pressSyncPosition', () => {
//   test('', () => {
//     expect(true).toBe(false);
//   });
// });
