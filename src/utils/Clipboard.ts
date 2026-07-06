import * as Clipboard from 'expo-clipboard';

export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    return await Clipboard.setStringAsync(text);
  } catch {
    return false;
  }
};
