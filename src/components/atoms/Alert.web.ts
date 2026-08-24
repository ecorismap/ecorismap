import { type AlertButton, type AlertOptions } from 'react-native';

import Swal from 'sweetalert2';
import { showStyledDialog } from '../molecules/StyledDialog';

export type CustomAlertButton = AlertButton & {
  swalType?: 'deny' | 'cancel' | 'confirm';
};

class WebAlert {
   
  public alert(title: string, message?: string, buttons?: CustomAlertButton[], options?: AlertOptions): void {
    // App直下のStyledDialogで表示する。未マウント時のみsweetalert2へフォールバック
    if (showStyledDialog({ title, message, buttons, options })) return;
    const confirmButton = buttons ? buttons.find((button) => button.swalType === 'confirm') : undefined;
    const denyButton = buttons ? buttons.find((button) => button.swalType === 'deny') : undefined;
    const cancelButton = buttons ? buttons.find((button) => button.swalType === 'cancel') : undefined;
    if (confirmButton === undefined && denyButton === undefined && cancelButton === undefined) {
      Swal.fire({
        title: title,
        text: message,
        showConfirmButton: true,
        customClass: {
          container: 'swal2-custom-container',
        },
      });
      return;
    }
    Swal.fire({
      title: title,
      text: message,
      showConfirmButton: !!confirmButton,
      showDenyButton: !!denyButton,
      showCancelButton: !!cancelButton,
      confirmButtonText: confirmButton?.text,
      denyButtonText: denyButton?.text,
      cancelButtonText: cancelButton?.text,
      customClass: {
        container: 'swal2-custom-container',
      },
    }).then((result) => {
      if (result.isConfirmed) {
        if (confirmButton?.onPress !== undefined) {
          confirmButton.onPress();
        }
      } else if (result.isDenied) {
        if (denyButton?.onPress !== undefined) {
          denyButton.onPress();
        }
      } else if (result.isDismissed) {
        if (cancelButton?.onPress !== undefined) {
          cancelButton.onPress();
        }
      }
    });
  }
}

export const Alert = new WebAlert();
