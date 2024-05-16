import { type AlertButton, type AlertOptions } from 'react-native';

import Swal from 'sweetalert2';

export type CustomAlertButton = AlertButton & {
  swalType?: 'deny' | 'cancel' | 'confirm';
};

class WebAlert {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public alert(title: string, message?: string, buttons?: CustomAlertButton[], options?: AlertOptions): void {
    const confirmButton = buttons ? buttons.find((button) => button.swalType === 'confirm') : undefined;
    const denyButton = buttons ? buttons.find((button) => button.swalType === 'deny') : undefined;
    const cancelButton = buttons ? buttons.find((button) => button.swalType === 'cancel') : undefined;

    Swal.fire({
      title: title,
      text: message,
      showConfirmButton: !!confirmButton,
      showDenyButton: !!denyButton,
      showCancelButton: !!cancelButton,
      confirmButtonText: confirmButton?.text,
      denyButtonText: denyButton?.text,
      cancelButtonText: cancelButton?.text,
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
