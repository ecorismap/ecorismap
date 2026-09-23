---
name: react-native-patterns
description: React Native + Expo開発のベストプラクティス。コンポーネント設計、状態管理、Hooks、ナビゲーション、パフォーマンス最適化について。React NativeやExpoの実装について質問があるときに使用。
---

# React Native パターン

EcorisMapにおけるReact Native + Expo開発のベストプラクティスです。

## 技術スタック

- **React Native 0.81.5** + **Expo 54**（Bare Workflow）
- **TypeScript 5.9**（strictモード）
- **React Navigation 7**

## コンポーネント設計

### Atomic Design

```
src/components/
├── atoms/       # Button, Input, Icon, Text
├── molecules/   # FormField, Card, ListItem
├── organisms/   # Form, Modal, MapView
└── pages/       # フルページコンポーネント
```

### Container/Presentational分離

```typescript
// containers/ - ビジネスロジック
const MapContainer: React.FC = () => {
  const data = useSelector(selectMapData);
  const dispatch = useDispatch();

  const handleMarkerPress = useCallback((id: string) => {
    dispatch(selectFeature(id));
  }, [dispatch]);

  return <MapView data={data} onMarkerPress={handleMarkerPress} />;
};

// components/ - 表示のみ
interface MapViewProps {
  data: Feature[];
  onMarkerPress: (id: string) => void;
}

const MapView: React.FC<MapViewProps> = ({ data, onMarkerPress }) => {
  return (
    <View>
      {data.map(feature => (
        <Marker
          key={feature.id}
          coordinate={feature.coordinates}
          onPress={() => onMarkerPress(feature.id)}
        />
      ))}
    </View>
  );
};
```

## 状態管理

### 使い分け

| 種類 | 用途 | 実装 |
|------|------|------|
| グローバル | アプリ全体で共有 | Redux Toolkit |
| 機能特化 | 特定機能で共有 | React Context |
| ローカル | コンポーネント内 | useState/useReducer |

### Redux Toolkitパターン

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface FeatureState {
  items: Feature[];
  selectedId: string | null;
  loading: boolean;
}

const initialState: FeatureState = {
  items: [],
  selectedId: null,
  loading: false,
};

const featureSlice = createSlice({
  name: 'features',
  initialState,
  reducers: {
    setFeatures: (state, action: PayloadAction<Feature[]>) => {
      state.items = action.payload;
    },
    selectFeature: (state, action: PayloadAction<string>) => {
      state.selectedId = action.payload;
    },
  },
});
```

## Hooks パターン

### カスタムフック

```typescript
// データ取得フック
const useFeatureData = (layerId: string) => {
  const [data, setData] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
      try {
        const result = await loadFeatures(layerId);
        if (mounted) {
          setData(result);
          setLoading(false);
        }
      } catch (e) {
        if (mounted) {
          setError(e as Error);
          setLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      mounted = false;
    };
  }, [layerId]);

  return { data, loading, error };
};
```

### メモ化

```typescript
// useMemo - 計算結果
const filteredFeatures = useMemo(() => {
  return features.filter(f => f.properties.visible);
}, [features]);

// useCallback - コールバック
const handlePress = useCallback((id: string) => {
  dispatch(selectFeature(id));
}, [dispatch]);

// React.memo - コンポーネント
const MemoizedMarker = React.memo(Marker);
```

## ナビゲーション

### React Navigation設定

```typescript
// src/routes/
const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Home">
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
```

### 型安全なナビゲーション

```typescript
type RootStackParamList = {
  Home: undefined;
  Feature: { id: string };
  Settings: undefined;
};

// 使用時
navigation.navigate('Feature', { id: 'abc123' });
```

## パフォーマンス

### FlatListの最適化

```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={item => item.id}
  getItemLayout={getItemLayout}  // 固定高さの場合
  initialNumToRender={10}
  maxToRenderPerBatch={10}
  windowSize={5}
  removeClippedSubviews={true}
/>
```

### 画像最適化

```typescript
import { Image } from 'expo-image';

<Image
  source={{ uri }}
  style={styles.image}
  contentFit="cover"
  transition={200}
  cachePolicy="memory-disk"
/>
```

## エラーハンドリング

### Error Boundary

```typescript
class ErrorBoundary extends React.Component<Props, State> {
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logErrorToService(error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback error={this.state.error} />;
    }
    return this.props.children;
  }
}
```

## テスト

### コンポーネントテスト

```typescript
import { render, fireEvent } from '@testing-library/react-native';

describe('Button', () => {
  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <Button title="Click me" onPress={onPress} />
    );

    fireEvent.press(getByText('Click me'));
    expect(onPress).toHaveBeenCalled();
  });
});
```
