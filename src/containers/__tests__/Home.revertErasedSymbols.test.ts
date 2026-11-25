/**
 * 作図監査 E-M11: Home で作図を破棄する経路（キャンセル・編集レイヤ切替・タブ切替・
 * メモツール/情報ツールへの切替・選択ツールの解除）は、どれも resetDrawTools の前に
 * revertErasedSymbols を呼んで、タップ時点でストアへ確定した行動記号の削除を戻す。
 * 経路ごとの描画テストは Home の依存が大きすぎるため、呼び出し順を源コードで確かめる
 */
import fs from 'fs';
import path from 'path';

describe('Home の作図破棄経路', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'Home.tsx'), 'utf8');
  const lines = source.split('\n');

  it('resetDrawTools() の直前で必ず revertErasedSymbols() を呼ぶ', () => {
    const resetLines = lines.map((line, idx) => ({ line, idx })).filter(({ line }) => line.trim() === 'resetDrawTools();');
    //キャンセル・編集レイヤ切替・タブ切替・メモツール・情報ツール・選択解除の6経路
    expect(resetLines.length).toBeGreaterThanOrEqual(6);
    resetLines.forEach(({ idx }) => {
      expect(lines[idx - 1].trim()).toBe('revertErasedSymbols();');
    });
  });

  it('アカウント・プロジェクト一覧・ログインへ移る経路は、描きかけを確認してから捨てる leaveHome を通る', () => {
    const direct = lines.filter((line) => line.includes('leaveHomeWithTrackingGuard('));
    expect(direct).toHaveLength(1);
    const start = lines.findIndex((line) => line.includes('const leaveHome = useCallback('));
    const body = lines.slice(start, start + 12).map((line) => line.trim());
    const order = ['hasUnsavedDrawing()', 'leaveHomeWithTrackingGuard(', 'revertErasedSymbols();', 'resetDrawTools();'].map(
      (word) => body.findIndex((line) => line.includes(word))
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});
