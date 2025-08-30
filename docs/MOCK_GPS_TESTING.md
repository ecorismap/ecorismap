# 擬似GPSテストツール使用方法

## 概要
長い軌跡データの保存問題を検証するため、擬似的なGPS位置情報を生成してテストできる機能を実装しました。

## 使用方法

### 1. テストコンポーネントの配置
開発環境でのみ使用可能なMockGpsControllerコンポーネントを、マップ画面などに配置します。

```tsx
// 例: HomeScreenなどで使用
import { MockGpsController } from '../components/organisms/MockGpsController';

// useLocationフックから必要な関数を取得
const { useMockGps, toggleMockGps, mockGpsProgress } = useLocation(mapViewRef);

// JSX内で配置
<MockGpsController
  useMockGps={useMockGps}
  toggleMockGps={toggleMockGps}
  mockGpsProgress={mockGpsProgress}
/>
```

### 2. テストシナリオ

#### 長い軌跡テスト（デフォルト）
- **シナリオ**: `longTrack`
- **ポイント数**: 5000点（約42分の軌跡）
- **速度**: 10 m/s (36 km/h)
- **更新間隔**: 500ms

大量のポイントを生成して、長時間のトラッキングをシミュレートします。

#### その他のシナリオ
- **円形**: 一定半径の円形軌跡
- **直線**: A地点からB地点への直線移動
- **ランダム**: ランダムな動き
- **静止**: 同じ場所に留まる（精度のみ変動）

### 3. デバッグ方法

#### コンソールログの確認
```javascript
// 擬似GPS開始時
"Started mock GPS"
"Mock GPS enabled with scenario: longTrack"

// 進行状況（100ポイントごと）
"Mock GPS Progress: 100/5000 (2.0%)"
"Mock GPS Progress: 200/5000 (4.0%)"

// 擬似GPS停止時
"Mock GPS stopped"
```

#### 軌跡の保存テスト
1. MockGpsControllerで「長い軌跡」シナリオを選択
2. 「開始」ボタンをタップ
3. トラッキングを開始（通常のトラッキング開始手順）
4. 進行状況を確認しながら待機
5. トラッキングを停止して保存
6. 保存された軌跡データを確認

### 4. 問題の再現手順

1. 擬似GPSを「長い軌跡」モードで開始
2. トラッキングを開始
3. 最低でも1000ポイント以上（進行状況20%以上）まで待つ
4. トラッキングを停止して保存
5. 保存されたデータが正しく表示されるか確認

### 5. パラメータ調整

MockGpsControllerのUIから以下を調整可能：
- **ポイント数**: 100〜50000（長い軌跡モードのみ）
- **速度**: 1〜50 m/s
- **更新間隔**: 100〜5000 ms

### 6. 注意事項

- 開発環境（`__DEV__ === true`）でのみ使用可能
- 実際のGPSと擬似GPSを同時に使用することはできません
- 擬似GPSモード中は、実際の位置情報は取得されません
- テスト完了後は必ず擬似GPSを無効化してください

## トラブルシューティング

### 軌跡が保存されない場合
1. コンソールログでエラーを確認
2. MMKVストレージの容量を確認
3. 保存時のデータサイズを確認

### パフォーマンスの問題
- ポイント数を減らす
- 更新間隔を長くする
- デバイスのメモリ状況を確認

## コードの削除方法

テスト完了後、以下のファイルを削除してください：
1. `/src/utils/mockGpsHelper.ts`
2. `/src/components/organisms/MockGpsController.tsx`
3. `useLocation.ts`内の擬似GPS関連のコードを削除
4. このドキュメントファイル