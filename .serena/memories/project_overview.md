# EcorisMap プロジェクト概要

## プロジェクトの目的
EcorisMapは、野外調査で位置情報を記録・確認できるクロスプラットフォーム（iOS、Android、Web）のフィールド調査アプリケーションです。

## 技術スタック
- **フロントエンド**: React Native + Expo (Bare Workflow)
- **言語**: TypeScript (strict mode)
- **状態管理**: Redux Toolkit + Redux Persist
- **ナビゲーション**: React Navigation
- **バックエンド**: Firebase (Auth, Firestore, Storage)
- **地図**: React Native Maps (モバイル) / MapLibre GL (Web)
- **国際化**: i18next
- **地理空間処理**: GDAL (react-native-gdalwarp カスタムネイティブモジュール)
- **暗号化**: Virgil E3Kit

## アーキテクチャ
- ハイブリッド状態管理: Redux（グローバル）+ React Context（機能別）
- Atomic Designパターンでコンポーネント構成
- GeoJSONベースのデータ構造
- レイヤーベースの地理情報管理