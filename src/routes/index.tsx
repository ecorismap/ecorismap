import React from 'react';
import { View, StyleSheet } from 'react-native';
import Home from '../containers/Home';
import Account from '../containers/Account';
import AccountSettings from '../containers/AccountSettings';
import Purchases from '../containers/Purchases';
import ProjectEdit from '../containers/ProjectEdit';
import Projects from '../containers/Projects';
import CloudDataManagement from '../containers/CloudDataManagement';
import {
  RootNavigationProvider,
  useRootNavigation,
  RootScreenParams,
} from '../contexts/RootNavigationContext';

// Navigation型（useRootNavigationの戻り値から抽出）
type Navigation = Pick<ReturnType<typeof useRootNavigation>, 'navigate' | 'setParams'>;

// Props型
export type Props_Account = {
  navigation: Navigation;
  route: { params: RootScreenParams['Account'] };
};

export type Props_Home = {
  navigation: Navigation;
  route: { params: RootScreenParams['Home'] };
};

export type Props_AccountSettings = {
  navigation: Navigation;
  route: { params: RootScreenParams['AccountSettings'] };
};

export type Props_Purchases = {
  navigation: Navigation;
  route: { params: RootScreenParams['Purchases'] };
};

export type Props_Projects = {
  navigation: Navigation;
  route: { params: RootScreenParams['Projects'] };
};

export type Props_ProjectEdit = {
  navigation: Navigation;
  route: { params: RootScreenParams['ProjectEdit'] };
};

export type Props_CloudDataManagement = {
  navigation: Navigation;
  route: { params: RootScreenParams['CloudDataManagement'] };
};

// 画面をレンダリングするコンポーネント
function RootScreenRenderer() {
  const { currentScreen, currentParams, navigate, setParams } = useRootNavigation();

  // 各画面に渡すnavigationとrouteオブジェクト
  const navigation = { navigate, setParams };

  switch (currentScreen) {
    case 'Home':
      return <Home navigation={navigation} route={{ params: currentParams as RootScreenParams['Home'] }} />;
    case 'Account':
      return <Account navigation={navigation} route={{ params: currentParams as RootScreenParams['Account'] }} />;
    case 'AccountSettings':
      return (
        <AccountSettings
          navigation={navigation}
          route={{ params: currentParams as RootScreenParams['AccountSettings'] }}
        />
      );
    case 'Purchases':
      return <Purchases navigation={navigation} route={{ params: currentParams as RootScreenParams['Purchases'] }} />;
    case 'Projects':
      return <Projects navigation={navigation} route={{ params: currentParams as RootScreenParams['Projects'] }} />;
    case 'ProjectEdit':
      return (
        <ProjectEdit navigation={navigation} route={{ params: currentParams as RootScreenParams['ProjectEdit'] }} />
      );
    case 'CloudDataManagement':
      return (
        <CloudDataManagement
          navigation={navigation}
          route={{ params: currentParams as RootScreenParams['CloudDataManagement'] }}
        />
      );
    default:
      return <Home navigation={navigation} route={{ params: undefined }} />;
  }
}

export default function Routes() {
  return (
    <RootNavigationProvider initialScreen="Home" initialParams={undefined}>
      <View style={styles.container}>
        <RootScreenRenderer />
      </View>
    </RootNavigationProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
