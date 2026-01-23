# ユーザー固有CLAUDE.md設定例

このファイルは、個人の開発環境に合わせたCLAUDE.md設定例です。

## 配置場所

ユーザー固有の設定は以下のいずれかに配置します：

- `~/.claude/CLAUDE.md` - グローバル設定
- プロジェクトルートの`.claude/CLAUDE.local.md` - プロジェクト固有（gitignore推奨）

## 設定例

### 基本設定

```markdown
# ユーザー設定

## 個人の好み

### コーディングスタイル
- 関数型プログラミングを好む
- 明示的な型注釈を常に使用
- 早期リターンパターンを使用

### コミュニケーション
- 技術的な説明は詳細に
- コード例を多く含める
- 変更の理由を常に説明する

### 開発環境
- エディタ: VS Code
- ターミナル: iTerm2
- シェル: zsh
```

### 開発環境固有設定

```markdown
## 開発環境

### パス設定
- Android SDK: /Users/[username]/Library/Android/sdk
- Xcode: /Applications/Xcode.app

### 環境変数
注: 実際の値は設定しないでください
- GOOGLE_MAPS_API_KEY: 設定済み
- FIREBASE_PROJECT_ID: 設定済み

### シミュレータ設定
- iOS: iPhone 15 Pro (iOS 17)
- Android: Pixel 7 (API 34)
```

### ワークフロー設定

```markdown
## 作業スタイル

### 新機能開発時
1. 要件確認
2. 設計レビュー
3. TDD実装
4. コードレビュー
5. 動作確認

### バグ修正時
1. 再現確認
2. 原因調査
3. テスト作成
4. 修正
5. リグレッションテスト

### コミット前チェック
- [ ] 型チェック通過
- [ ] リント通過
- [ ] テスト通過
- [ ] 3プラットフォーム確認
```

### ショートカット設定

```markdown
## よく使うコマンド

### 開発
- `yarn start` - 開発サーバー
- `yarn ios` - iOSシミュレータ
- `yarn android` - Androidエミュレータ
- `yarn web` - Web版

### テスト
- `yarn test` - 全テスト
- `yarn test:coverage` - カバレッジ付き
- `yarn testemu` - Firebase使用テスト

### デバッグ
- Reactotronを使用
- Chrome DevToolsでWeb版デバッグ
```

## 注意事項

### gitignore推奨

ユーザー固有設定は`.gitignore`に追加することを推奨：

```gitignore
# ユーザー固有Claude設定
.claude/CLAUDE.local.md
```

### センシティブ情報

以下の情報は含めないでください：
- APIキー
- パスワード
- 個人識別情報
- 内部システムのURL

### 定期的な更新

- 開発環境が変わった時
- ツールをアップデートした時
- ワークフローが変わった時
