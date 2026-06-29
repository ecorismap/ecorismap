/**
 * Firestore / Storage Security Rules 用の専用 jest 設定。
 *
 * 通常の jest 設定は jest-expo preset（React Native 用）を使うため、Firebase JS SDK を
 * 使う Rules テスト（src/lib/__tests__/firebase/）は起動できない。本設定は node 環境＋
 * babel 変換のみで、Firebase の ESM モジュールも変換対象にする。
 *
 * 実行例:
 *   firebase emulators:exec --only firestore,storage \
 *     'npx jest --config jest.rules.config.js'
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/src/lib/__tests__/firebase/**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': 'babel-jest',
  },
  // Firebase 系の ESM パッケージは変換が必要なので ignore から除外する。
  transformIgnorePatterns: ['/node_modules/(?!(@firebase|firebase)/)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
};
