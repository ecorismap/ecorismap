# セッション設定例

Claude Codeセッションの設定と活用例です。

## セッションとは

セッションは、特定のタスクやコンテキストに対する作業単位です。セッション設定を活用することで、効率的な開発が可能になります。

## セッション設定例

### 1. 機能開発セッション

```json
{
  "name": "feature-user-profile",
  "description": "ユーザープロフィール機能の開発",
  "context": {
    "focus_areas": [
      "src/components/organisms/Profile/",
      "src/hooks/useProfile.ts",
      "src/modules/user.ts"
    ],
    "related_docs": [
      "docs/MIGRATION_GUIDE.md"
    ]
  },
  "goals": [
    "プロフィール表示コンポーネントの実装",
    "プロフィール編集機能の実装",
    "テストカバレッジ60%以上"
  ],
  "constraints": [
    "既存のHomeContextパターンに従う",
    "iOS/Android/Web全プラットフォーム対応"
  ]
}
```

### 2. バグ修正セッション

```json
{
  "name": "bugfix-map-crash",
  "description": "地図表示時のクラッシュ修正",
  "context": {
    "issue": "#123",
    "symptoms": [
      "大量のマーカー表示時にアプリがクラッシュ",
      "Android端末で特に顕著"
    ],
    "focus_areas": [
      "src/components/organisms/MapContainer/",
      "src/hooks/useMapData.ts"
    ]
  },
  "goals": [
    "クラッシュ原因の特定",
    "修正の実装",
    "リグレッションテストの追加"
  ],
  "constraints": [
    "パフォーマンスを改善する形で修正",
    "既存のAPIを変更しない"
  ]
}
```

### 3. リファクタリングセッション

```json
{
  "name": "refactor-context-migration",
  "description": "HomeContextの分割",
  "context": {
    "current_state": "HomeContextが86個のpropsを持つ巨大Context",
    "target_state": "機能ごとに分割された小さなContext群",
    "guide": "docs/MIGRATION_GUIDE.md"
  },
  "goals": [
    "MapContextの分離",
    "DataContextの分離",
    "段階的な移行の実施"
  ],
  "phases": [
    {
      "phase": 1,
      "description": "MapContext分離",
      "files": ["src/contexts/MapContext.tsx"]
    },
    {
      "phase": 2,
      "description": "DataContext分離",
      "files": ["src/contexts/DataContext.tsx"]
    }
  ]
}
```

### 4. 学習セッション

```json
{
  "name": "learn-geospatial",
  "description": "地理空間データ処理の学習",
  "mode": "research",
  "context": {
    "topics": [
      "GeoJSON形式",
      "座標系変換",
      "Turf.js活用"
    ],
    "reference_files": [
      "src/utils/geo/",
      ".claude/rules/geospatial.md"
    ]
  },
  "goals": [
    "EcorisMapの地理空間処理を理解",
    "GDALの使用方法を把握",
    "パフォーマンス最適化手法を学ぶ"
  ]
}
```

## セッション活用のベストプラクティス

### 1. 明確な目標設定

```json
{
  "goals": [
    "具体的で測定可能な目標1",
    "具体的で測定可能な目標2"
  ]
}
```

### 2. フォーカスエリアの限定

```json
{
  "focus_areas": [
    "src/specific/directory/",
    "src/specific/file.ts"
  ]
}
```

### 3. 制約の明示

```json
{
  "constraints": [
    "既存APIを変更しない",
    "後方互換性を維持"
  ]
}
```

### 4. 関連リソースの紐付け

```json
{
  "related_docs": ["docs/relevant.md"],
  "related_issues": ["#123", "#456"],
  "related_prs": ["#789"]
}
```

## セッション間の連携

### 依存関係

```json
{
  "name": "feature-b",
  "depends_on": ["feature-a"],
  "blocked_by": ["bugfix-critical"]
}
```

### 継続セッション

```json
{
  "name": "feature-profile-part2",
  "continues": "feature-profile-part1",
  "completed_goals": [
    "プロフィール表示コンポーネントの実装"
  ],
  "remaining_goals": [
    "プロフィール編集機能の実装",
    "テストカバレッジ60%以上"
  ]
}
```

## 注意事項

- セッション設定は参考情報として活用
- 長期間のセッションは定期的に目標を見直す
- 完了したセッションは記録として保存
