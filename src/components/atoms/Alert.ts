import { Alert as RNAlert, type AlertOptions, type AlertButton, type AlertType } from 'react-native';
import { showStyledDialog } from '../molecules/StyledDialog';

type CustomAlertButton = AlertButton & {
  swalType?: 'deny' | 'cancel' | 'confirm';
};

export interface ExtendedAlertStatic {
  alert: (title: string, message?: string, buttons?: CustomAlertButton[], options?: AlertOptions) => void;
  prompt: (
    title: string,
    message?: string,
    callbackOrButtons?: ((text: string) => void) | CustomAlertButton[],
    type?: AlertType,
    defaultValue?: string,
    keyboardType?: string
  ) => void;
}

export const Alert: ExtendedAlertStatic = {
  // App直下のStyledDialogで表示する。未マウント時のみネイティブAlertへフォールバック
  alert: (title, message, buttons, options) => {
    if (showStyledDialog({ title, message, buttons, options })) return;
    RNAlert.alert(title, message, buttons, options);
  },
  prompt: (title, message, callbackOrButtons, type, defaultValue, keyboardType) =>
    RNAlert.prompt(title, message, callbackOrButtons, type, defaultValue, keyboardType),
};
