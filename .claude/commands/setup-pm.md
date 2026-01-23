# パッケージマネージャー設定コマンド

プロジェクトで使用するパッケージマネージャーを検出・設定します。

## 使用方法

```
/setup-pm [パッケージマネージャー名]
```

## 機能

### 自動検出

引数なしで実行すると、プロジェクトのパッケージマネージャーを自動検出します。

```
/setup-pm
```

#### 検出ロジック

1. ロックファイルの確認
   - `yarn.lock` → Yarn
   - `package-lock.json` → npm
   - `pnpm-lock.yaml` → pnpm
   - `bun.lockb` → Bun

2. `package.json`の`packageManager`フィールド確認

3. デフォルト: プロジェクト設定に従う（EcorisMapはYarn 3.6.4）

### 明示的な設定

特定のパッケージマネージャーを設定します。

```
/setup-pm yarn
/setup-pm npm
/setup-pm pnpm
/setup-pm bun
```

## EcorisMap設定

EcorisMapでは**Yarn 3.6.4**を使用しています。

### 確認方法

```bash
# バージョン確認
yarn --version

# 3.6.4が出力されることを確認
```

### Yarnコマンド対応表

| 操作 | コマンド |
|------|---------|
| インストール | `yarn install` |
| 依存追加 | `yarn add [package]` |
| 開発依存追加 | `yarn add -D [package]` |
| 削除 | `yarn remove [package]` |
| スクリプト実行 | `yarn [script]` |
| キャッシュクリア | `yarn cache clean` |

## 出力

### 検出結果

```
📦 パッケージマネージャー検出結果

検出: Yarn (v3.6.4)
ロックファイル: yarn.lock
設定ファイル: .yarnrc.yml

コマンドマッピング:
  install  → yarn install
  add      → yarn add
  remove   → yarn remove
  run      → yarn
  exec     → yarn exec
```

### 設定完了

```
✅ パッケージマネージャーを設定しました

パッケージマネージャー: Yarn
バージョン: 3.6.4

このセッションでは以下のコマンドを使用します:
- インストール: yarn install
- 追加: yarn add [package]
- 削除: yarn remove [package]
- 実行: yarn [script]
```

## スクリプト統合

`.claude/scripts/lib/package-manager.js`と連携し、コマンド実行時に適切なパッケージマネージャーを使用します。

```javascript
// 使用例（内部処理）
const pm = await detectPackageManager();
await pm.install();
await pm.add('lodash');
await pm.run('test');
```

## トラブルシューティング

### ロックファイルの不一致

複数のロックファイルが存在する場合：

```
⚠️ 複数のロックファイルが検出されました

検出されたファイル:
- yarn.lock
- package-lock.json

推奨: 使用しないロックファイルを削除してください
例: rm package-lock.json
```

### バージョン不一致

```
⚠️ Yarnバージョンが推奨と異なります

現在: 1.22.19
推奨: 3.6.4

対処法:
corepack enable
corepack prepare yarn@3.6.4 --activate
```

## 引数

`$ARGUMENTS`で以下を指定可能：

- なし - 自動検出
- `yarn` - Yarnを設定
- `npm` - npmを設定
- `pnpm` - pnpmを設定
- `bun` - Bunを設定
- `--check` - 現在の設定を確認
- `--fix` - 問題を自動修正

## 注意事項

- EcorisMapプロジェクトではYarn 3.6.4を使用してください
- ロックファイルは1種類のみ保持することを推奨
- `node_modules`は`.gitignore`に含まれています
- Yarn PnPは使用していません（nodeLinker: node-modules）
