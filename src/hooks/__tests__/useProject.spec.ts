describe('プロジェクト一覧の表示', () => {
  //この部分は、useProjectsのテストかもしれない。
  test('メンバーはプロジェクトを読み込める', () => {
    //スマホ版で消したプロジェクトが読み込まれてしまう。{server}を有効にすべき？
    expect(true).toBe(false);
  });
  test('自分がリセットしたら、プロジェクト一覧を読み込めない。管理者がメンバーをグループに再登録すればデータを読み込める', () => {
    expect(true).toBe(true);
  });
  test('管理者がリセットしたら、プロジェクトを読み込めなくなる？', () => {
    //対策ある？
    //GroupError: Group with given id and initiator could not be found
    expect(true).toBe(false);
  });
});
