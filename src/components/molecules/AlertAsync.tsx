import { Alert } from '../atoms/Alert';

export const ConfirmAsync = async (
  message: string,
  text: { true: string; false: string } = { true: 'Yes', false: 'No' }
): Promise<boolean> =>
  new Promise((resolve) => {
    Alert.alert(
      '',
      message,
      [
        { text: text.false, style: 'cancel', onPress: () => resolve(false) },
        { text: text.true, onPress: () => resolve(true) },
      ],
      {
        cancelable: true,
        onDismiss: () => resolve(false),
      }
    );
  });

export const AlertAsync = async (message: string) =>
  new Promise((resolve) => {
    Alert.alert('', message, [{ text: 'OK', onPress: () => resolve(true) }], {
      cancelable: true,
      onDismiss: () => resolve(false),
    });
  });
