import { formatLoadingText } from '../loadingText';

describe('formatLoadingText', () => {
  test('進捗が0のあいだは説明だけを出す（0%で止まって見えないように）', () => {
    expect(formatLoadingText('PDFを変換しています', '0')).toBe('PDFを変換しています');
  });

  test('進捗が出たら説明の下に%を添える', () => {
    expect(formatLoadingText('PDFを変換しています', '73')).toBe('PDFを変換しています\n73%');
  });

  test('数値でない進捗は説明だけを出す', () => {
    expect(formatLoadingText('処理中...', '')).toBe('処理中...');
    expect(formatLoadingText('処理中...', 'abc')).toBe('処理中...');
  });
});
