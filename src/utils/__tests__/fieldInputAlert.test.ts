import { fieldInputErrorMessage, resetFieldInputAlert, shouldShowFieldInputAlert } from '../fieldInputAlert';

jest.mock('../../i18n/config', () => ({ t: (key: string) => key }));

describe('fieldInputAlert', () => {
  beforeEach(() => resetFieldInputAlert());

  it('確認には欄の名前・形式・値が入る', () => {
    expect(fieldInputErrorMessage('個体数', 'INTEGER', 'たくさん')).toBe(
      'Data.alert.checkFieldInput 個体数(INTEGER):たくさん '
    );
  });

  it('同じ確認は、続けて届いても1回だけ出す', () => {
    const message = fieldInputErrorMessage('個体数', 'INTEGER', 'たくさん');
    expect(shouldShowFieldInputAlert(message, 1000)).toBe(true);
    // 欄を離れた直後の保存、ネイティブの onEndEditing と onBlur
    expect(shouldShowFieldInputAlert(message, 1050)).toBe(false);
    expect(shouldShowFieldInputAlert(message, 1900)).toBe(false);
  });

  it('時間をおいて保存し直したときは、もう一度出す', () => {
    const message = fieldInputErrorMessage('個体数', 'INTEGER', 'たくさん');
    expect(shouldShowFieldInputAlert(message, 1000)).toBe(true);
    expect(shouldShowFieldInputAlert(message, 2000)).toBe(true);
  });

  it('別の欄や別の値の確認は、直後でも出す', () => {
    expect(shouldShowFieldInputAlert(fieldInputErrorMessage('個体数', 'INTEGER', 'たくさん'), 1000)).toBe(true);
    expect(shouldShowFieldInputAlert(fieldInputErrorMessage('樹高', 'DECIMAL', '高い'), 1010)).toBe(true);
    expect(shouldShowFieldInputAlert(fieldInputErrorMessage('個体数', 'INTEGER', '少し'), 1020)).toBe(true);
  });
});
