// react-native-background-geolocation のラッパー（Web用スタブ）。
// Web では GPS・軌跡記録を使用しないため、ネイティブモジュールに依存しない代替を提供する。
// 本体ライブラリは import 時にネイティブモジュールを解決して例外を投げるので、ランタイムでは一切参照しない。
// 型・enum 定数はすべて純JSの型定義パッケージ（@transistorsoft/background-geolocation-types）から取得する。
import { DesiredAccuracy, AuthorizationStatus } from '@transistorsoft/background-geolocation-types';

export type {
  Location,
  Subscription,
  State,
  Config,
  NotificationConfig,
} from '@transistorsoft/background-geolocation-types';

// enum 定数は実体を保持し、メソッド呼び出しは no-op（Web では Platform.OS ガードにより呼ばれない想定）。
const noop = () => Promise.resolve();
const BackgroundGeolocation = new Proxy(
  { DesiredAccuracy, AuthorizationStatus } as Record<string, unknown>,
  {
    get: (target, prop: string) => (prop in target ? target[prop] : noop),
  }
  // 型はネイティブ版ラッパー(.ts)の default に合わせる（typeof import は型のみでランタイムには残らない）。
) as unknown as typeof import('./backgroundGeolocation').default;

export default BackgroundGeolocation;
