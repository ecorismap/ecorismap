import { t } from '../i18n/config';

// 欄を離れたときの確認と、保存時の確認が、同じ操作（文字を入れた欄にカーソルを置いたまま保存を押す）で
// 続けて出ないようにする。同じ内容の確認は、この時間内なら1回だけ出す。
// ネイティブでは onEndEditing と onBlur の両方が届くので、その重複もここで落ちる
const SAME_GESTURE_MS = 1000;

let lastShown: { message: string; at: number } | null = null;

export const fieldInputErrorMessage = (name: string, format: string, value: unknown) =>
  `${t('Data.alert.checkFieldInput')} ${name}(${format}):${value} `;

/** この確認を出してよいか。出す場合は「いま出した」と記録する */
export const shouldShowFieldInputAlert = (message: string, now: number = Date.now()) => {
  if (lastShown !== null && lastShown.message === message && now - lastShown.at < SAME_GESTURE_MS) return false;
  lastShown = { message, at: now };
  return true;
};

export const resetFieldInputAlert = () => {
  lastShown = null;
};
