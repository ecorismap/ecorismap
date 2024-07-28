import dayjs from 'dayjs';
import * as Localization from 'expo-localization';
import localeData from 'dayjs/plugin/localeData';
import customParseFormat from 'dayjs/plugin/customParseFormat';
// 最大値・最小値の計算するための拡張プラグイン
import LocalizedFormat from 'dayjs/plugin/localizedFormat';

// 日本時間に変換する
import 'dayjs/locale/ja';
import { Platform } from 'react-native';

const languageCode = Localization.getLocales()[0]?.languageCode;

// プラグイン拡張
dayjs.extend(LocalizedFormat);
dayjs.extend(customParseFormat);
dayjs.locale(languageCode ?? 'ja');
dayjs.extend(localeData);
//console.log(Localization.locale, dayjs().format('L'));

export const LocalizedDateFormatForWeb =
  Platform.OS === 'web' ? dayjs().localeData().longDateFormat('L').replaceAll('Y', 'y').replaceAll('D', 'd') : '';
export default dayjs;
