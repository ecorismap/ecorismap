import { Alert as RNAlert, type AlertOptions, type AlertButton, type AlertType } from 'react-native';

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

export const Alert: ExtendedAlertStatic = RNAlert as ExtendedAlertStatic;
