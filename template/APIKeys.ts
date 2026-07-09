// APIKeys.ts のテンプレート。実際の値を設定して src/constants/APIKeys.ts に配置する。
// 本ファイルはCIでsecret（APIKEYS_TS_BASE64）が未設定の場合のフォールバックにも使われる。
export const firebaseConfig = {
  apiKey: 'YOUR-API-KEY',
  authDomain: 'YOUR-PROJECT.firebaseapp.com',
  projectId: 'YOUR-PROJECT',
  storageBucket: 'YOUR-PROJECT.appspot.com',
  messagingSenderId: '',
  appId: '',
  measurementId: '',
};
export const reCaptureSiteKey = '';
export const maptilerKey = 'YOUR-API-KEY';
// Google Drive連携用OAuthクライアントID
// 作成手順: docs/GOOGLE_DRIVE_SETUP.md の「1-3. OAuthクライアントIDを作成」参照
// 空文字列の場合、Google Drive連携は「利用不可」として安全に無効化される
export const googleDriveOAuth = {
  webClientId: '',
  iosClientId: '',
};
