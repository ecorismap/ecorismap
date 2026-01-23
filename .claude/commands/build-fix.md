# ビルドエラー解決コマンド

iOS/Android/Webのビルドエラーを診断・解決します。

## 使用方法

```
/build-fix [プラットフォーム]
```

## プラットフォーム指定

| 引数 | 対象 |
|------|------|
| `ios` | iOSビルド |
| `android` | Androidビルド |
| `web` | Webビルド |
| (なし) | エラーから自動判定 |

## 診断フロー

### 1. エラー情報収集
- 直近のビルドログを確認
- エラーメッセージを特定
- スタックトレースを分析

### 2. 環境確認
```bash
# Node.jsバージョン
node -v  # >= 22 必須

# Yarnバージョン
yarn -v  # 3.6.4 推奨

# patch-package適用状況
ls patches/
```

### 3. プラットフォーム別診断

#### iOS
```bash
npx expo run:ios
cd ios && pod install
```
- CocoaPods依存関係
- Xcode設定
- ネイティブモジュールリンク

#### Android
```bash
yarn android
cd android && ./gradlew clean
```
- Gradle依存関係
- SDK設定
- ProGuard設定

#### Web
```bash
yarn web
yarn build:web
```
- webpack/metro設定
- babel設定
- Platform固有コードの漏れ

### 4. 修正提案
- 具体的な修正手順
- 検証コマンド

## よくあるエラーと解決策

### 共通
| エラー | 解決策 |
|--------|--------|
| Node.jsバージョン | `nvm use 22` |
| 依存関係エラー | `rm -rf node_modules && yarn install` |
| キャッシュ問題 | `yarn cache clean` |

### iOS
| エラー | 解決策 |
|--------|--------|
| Pod install失敗 | `cd ios && pod deintegrate && pod install` |
| M1/M2問題 | `arch -x86_64 pod install` |

### Android
| エラー | 解決策 |
|--------|--------|
| Gradleエラー | `cd android && ./gradlew clean` |
| SDK未検出 | Android Studio SDK Manager確認 |

### Web
| エラー | 解決策 |
|--------|--------|
| Platform固有エラー | `.web.tsx`ファイル作成 |
| 型エラー | `npx tsc --noEmit`で確認 |

## 引数

`$ARGUMENTS`が指定された場合、そのプラットフォームのビルドエラーを診断。
指定なしの場合は、最新のエラーログから判定。

## 出力形式

```markdown
## ビルドエラー診断

### プラットフォーム
[iOS/Android/Web]

### エラー概要
[エラーメッセージの要約]

### 原因
[根本原因]

### 解決手順
1. [手順1]
2. [手順2]

### 検証
[検証コマンド]
```

## 特記事項

- patch-packageで修正済みライブラリは`/patches`を確認
- react-native-gdalwarpは手動インストール必要
- Node.js >= 22 必須
