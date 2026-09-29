//テストでDOMを使わずに済むよう、必要な部分だけの型にする
type PrintableWindow = {
  addEventListener: (type: 'afterprint', listener: () => void, options?: { once: boolean }) => void;
  focus: () => void;
  print: () => void;
  close: () => void;
};

/**
 * 印刷用ウィンドウを印刷し、印刷ダイアログが閉じてからウィンドウを閉じる。
 * Chromeでは別ウィンドウに対するprint()はダイアログの終了を待たずに戻るため、
 * 直後にclose()すると印刷ダイアログごと閉じてしまい何も出力されない。
 * print()がダイアログの終了まで戻らないブラウザでも、afterprintはその間に発火するので同じ順で閉じる
 */
export const printAndCloseWindow = (target: PrintableWindow) =>
  new Promise<void>((resolve) => {
    target.addEventListener(
      'afterprint',
      () => {
        target.close();
        resolve();
      },
      { once: true }
    );
    target.focus();
    target.print();
  });
