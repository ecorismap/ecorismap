// react-native-background-geolocation のラッパー（ネイティブ用）。
// Web ではネイティブモジュールが無く、ライブラリが import 時に例外を投げるため、
// 同名の .web.ts でスタブに差し替える。アプリ側はこのモジュール経由で参照すること。
import BackgroundGeolocation from 'react-native-background-geolocation';

export type {
  Location,
  Subscription,
  State,
  Config,
  NotificationConfig,
} from 'react-native-background-geolocation';

export default BackgroundGeolocation;
