# EcorisMap 開発コマンド一覧

## 必須コマンド

### インストール・起動
```bash
yarn install        # 依存関係のインストール
yarn start         # Expo開発クライアント起動
yarn ios          # iOSシミュレーター起動
yarn android      # Androidエミュレーター起動
yarn web          # Web版起動
```

### コード品質チェック（タスク完了時に必ず実行）
```bash
yarn tsc          # TypeScriptの型チェック（エラーなし必須）
yarn lint         # ESLintで自動修正
```

### テスト
```bash
yarn test         # 全テスト実行
yarn test:coverage # カバレッジレポート付き
yarn testemu      # Firebaseエミュレーターでテスト
```

### Firebase開発
```bash
yarn emu          # Firebaseエミュレーター起動
```

### ビルド
```bash
yarn build:web    # Web版ビルド出力
```

## システムコマンド（macOS）
- `git`: バージョン管理
- `ls`, `cd`, `grep`, `find`: ファイル操作
- `rg` (ripgrep): 高速検索（推奨）