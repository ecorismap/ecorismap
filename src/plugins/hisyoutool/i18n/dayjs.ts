import dayjs from 'dayjs';
import * as Localization from 'expo-localization';
import localeData from 'dayjs/plugin/localeData';

// 最大値・最小値の計算するための拡張プラグイン
import LocalizedFormat from 'dayjs/plugin/localizedFormat';

// 日本時間に変換する
import 'dayjs/locale/ja';
import { Platform } from 'react-native';

// プラグイン拡張
dayjs.extend(LocalizedFormat);
dayjs.locale(Localization.locale.split('-')[0]);
dayjs.extend(localeData);
//console.log(Localization.locale, dayjs().format('L'));

export const LocalizedDateFormatForWeb =
  Platform.OS === 'web' ? dayjs().localeData().longDateFormat('L').replaceAll('Y', 'y').replaceAll('D', 'd') : '';
export default dayjs;
