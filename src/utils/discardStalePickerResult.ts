import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// Androidでカメラ・ライブラリの起動中にActivityが破棄されると、結果はexpo-image-pickerに保留され、
// 読み出すまで消えない（キャンセルや次の起動では消えない）。回収されなかった古い保留が残っていると、
// 次にカメラ中の破棄が起きたときに別の記録の写真として回収されてしまう（写真監査 P-L2）。
// 起動の直前に一度読み出して捨てておく。保留の仕組みはAndroidだけなので、ほかでは呼ばない
export const discardStalePickerResult = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;
  try {
    await ImagePicker.getPendingResultAsync();
  } catch {
    //捨てるだけなので、読めなくても撮影・選択は続ける
  }
};
