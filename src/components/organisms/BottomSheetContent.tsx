import React, { useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { useBottomSheetNavigation, BottomSheetScreenName } from '../../contexts/BottomSheetNavigationContext';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';

// Container コンポーネントのインポート
import Layers from '../../containers/Layers';
import Data from '../../containers/Data';
import DataEdit from '../../containers/DataEdit';
import LayerEdit from '../../containers/LayerEdit';
import LayerEditFeatureStyle from '../../containers/LayerEditFeatureStyle';
import LayerEditFieldItem from '../../containers/LayerEditFieldItem';
import Maps from '../../containers/Maps';
import MapList from '../../containers/MapList';
import MapEdit from '../../containers/MapEdit';
import Settings from '../../containers/Settings';
import Licenses from '../../containers/Licenses';

// 画面タイトルのマッピング
const SCREEN_TITLES: Record<BottomSheetScreenName, string> = {
  Layers: t('Layers.navigation.title'),
  Data: t('Data.navigation.title'),
  DataEdit: t('DataEdit.navigation.title'),
  LayerEdit: t('LayerEdit.navigation.title'),
  LayerEditFeatureStyle: t('LayerEditFeatureStyle.navigation.title'),
  LayerEditFieldItem: t('LayerEditFieldItem.navigation.title'),
  Maps: t('Maps.navigation.title'),
  MapList: t('MapList.navigation.title'),
  MapEdit: t('MapEdit.navigation.title'),
  Settings: t('Settings.navigation.title'),
  Licenses: t('Licenses.navigation.title'),
};

// 画面コンポーネントのマッピング
const SCREEN_COMPONENTS: Record<BottomSheetScreenName, React.ComponentType<any>> = {
  Layers,
  Data,
  DataEdit,
  LayerEdit,
  LayerEditFeatureStyle,
  LayerEditFieldItem,
  Maps,
  MapList,
  MapEdit,
  Settings,
  Licenses,
};

interface BottomSheetContentProps {
  // 必要に応じてpropsを追加
}

export function BottomSheetContent({}: BottomSheetContentProps) {
  const { currentScreen, isBottomSheetOpen } = useBottomSheetNavigation();

  const screenName = currentScreen.name;
  const screenParams = currentScreen.params;

  // 現在の画面コンポーネントを取得
  const ScreenComponent = useMemo(() => SCREEN_COMPONENTS[screenName], [screenName]);

  // タイトルを取得
  const title = useMemo(() => SCREEN_TITLES[screenName], [screenName]);

  if (!ScreenComponent) {
    return null;
  }

  // BottomSheetが開くまでローディング表示
  if (!isBottomSheetOpen) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={COLOR.GRAY4} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <BottomSheetHeader title={title} />
      {/* コンテンツ */}
      <View style={styles.content}>
        <ScreenComponent params={screenParams} />
      </View>
    </View>
  );
}

// ヘッダーコンポーネント
interface BottomSheetHeaderProps {
  title: string;
}

function BottomSheetHeader({ title: _title }: BottomSheetHeaderProps) {
  const { canGoBack } = useBottomSheetNavigation();
  const showBackButton = canGoBack();

  return (
    <View style={styles.header}>
      {showBackButton && (
        <View style={styles.backButtonContainer}>
          {/* 戻るボタンは各画面で個別に実装するため、ここでは表示しない */}
        </View>
      )}
      <View style={styles.titleContainer}>
        {/* タイトルは各画面で表示 */}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLOR.MAIN,
  },
  header: {
    height: 0, // ヘッダーは各containerで表示するため非表示
    backgroundColor: COLOR.MAIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonContainer: {
    position: 'absolute',
    left: 10,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default BottomSheetContent;
