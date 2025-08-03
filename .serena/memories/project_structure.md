# EcorisMap プロジェクト構造

## ルートディレクトリ
```
ecorismap/
├── src/                 # ソースコード
├── ios/                # iOS固有コード
├── android/            # Android固有コード
├── web/                # Web固有設定
├── modules/            # カスタムネイティブモジュール
├── patches/            # パッケージパッチ
├── template/           # API設定テンプレート
├── claude_docs/        # ドキュメント
└── .serena/           # Serenaメモリ
```

## src/ ディレクトリ構造
```
src/
├── components/         # UIコンポーネント（Atomic Design）
│   ├── atoms/         # 基本要素
│   ├── molecules/     # 複合コンポーネント
│   ├── organisms/     # 複雑なコンポーネント
│   └── pages/         # 完全なページ
├── containers/        # ビジネスロジック（Redux/Context接続）
├── contexts/          # React Contextプロバイダー
├── hooks/            # カスタムReactフック
├── modules/          # Reduxスライス
├── utils/            # ユーティリティ関数
├── routes/           # ナビゲーション設定
├── constants/        # 定数定義
├── types/            # TypeScript型定義
├── i18n/             # 国際化リソース
├── lib/              # 外部ライブラリラッパー
└── assets/           # 画像・フォント等
```

## 重要な設定ファイル
- `CLAUDE.md`: Claude AI用の指示書
- `package.json`: 依存関係とスクリプト
- `tsconfig.json`: TypeScript設定
- `.eslintrc.json`: ESLint設定
- `babel.config.js`: Babel設定
- `metro.config.js`: Metro設定