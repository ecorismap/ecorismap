import React from 'react';
import { Platform } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';

import { AppState } from '../modules';
import {
  AccountFormStateType,
  ColorStyle,
  CreateProjectType,
  LayerType,
  ProjectType,
  RecordType,
  RegionType,
  TileMapType,
} from '../types';
import Home from '../containers/Home';
import Account from '../containers/Account';
import AccountSettings from '../containers/AccountSettings';
import Purchases from '../containers/Purchases';
import Settings from '../containers/Settings';
import ProjectEdit from '../containers/ProjectEdit';
import Projects from '../containers/Projects';
import DataRoutes from './DataRoutes';
import { t } from '../i18n/config';
import Licenses from '../containers/Licenses';
import { FUNC_LOGIN } from '../constants/AppConstants';

export type RootStackParamList = {
  Account: { accountFormState?: AccountFormStateType; message?: string };
  Home:
    | {
        tileMap?: TileMapType | undefined;
        jumpTo?: RegionType;
      }
    | undefined;
  AccountSettings: { previous: keyof RootStackParamList };
  Purchases: undefined;
  Settings: { previous: keyof RootStackParamList };
  Licenses: { previous: keyof RootStackParamList };
  Projects: { reload: boolean } | undefined;
  ProjectEdit: {
    previous: keyof RootStackParamList;
    project: ProjectType;
    isNew: boolean;
    createType?: CreateProjectType;
  };
  Maps: undefined;
  MapList: undefined;
  Data: {
    targetLayer: LayerType;
  };
  DataEdit: {
    previous: keyof RootStackParamList;
    targetData: RecordType;
    targetLayer: LayerType;
    targetRecordSet: RecordType[];
    targetIndex: number;
    mainData?: RecordType;
    mainLayer?: LayerType;
  };
  Layers: undefined;
  LayerEdit: {
    targetLayer: LayerType;
    isEdited: boolean;
    previous?: keyof RootStackParamList;
    colorStyle?: ColorStyle;
    fieldIndex?: number;
    itemValues?: { value: string; isOther: boolean }[];
  };
  LayerEditFeatureStyle: {
    targetLayer: LayerType;
    isEdited: boolean;
    previous?: keyof RootStackParamList;
  };
  LayerEditFieldItem: {
    targetLayer: LayerType;
    fieldIndex: number;
    fieldItem: LayerType['field'][0];
    isEdited: boolean;
  };
};

export type NavigationProp = NativeStackScreenProps<RootStackParamList>;

export type Props_Account = NativeStackScreenProps<RootStackParamList, 'Account'>;
export type Props_Home = NativeStackScreenProps<RootStackParamList, 'Home'>;
export type Props_AccountSettings = NativeStackScreenProps<RootStackParamList, 'AccountSettings'>;
export type Props_Purchases = NativeStackScreenProps<RootStackParamList, 'Purchases'>;
export type Props_Settings = NativeStackScreenProps<RootStackParamList, 'Settings'>;
export type Props_Licenses = NativeStackScreenProps<RootStackParamList, 'Licenses'>;
export type Props_Projects = NativeStackScreenProps<RootStackParamList, 'Projects'>;
export type Props_ProjectEdit = NativeStackScreenProps<RootStackParamList, 'ProjectEdit'>;
export type Props_Maps = NativeStackScreenProps<RootStackParamList, 'Maps'>;
export type Props_MapList = NativeStackScreenProps<RootStackParamList, 'MapList'>;
export type Props_Data = NativeStackScreenProps<RootStackParamList, 'Data'>;
export type Props_DataEdit = NativeStackScreenProps<RootStackParamList, 'DataEdit'>;
export type Props_Layers = NativeStackScreenProps<RootStackParamList, 'Layers'>;
export type Props_LayerEdit = NativeStackScreenProps<RootStackParamList, 'LayerEdit'>;
export type Props_LayerEditFeatureStyle = NativeStackScreenProps<RootStackParamList, 'LayerEditFeatureStyle'>;
export type Props_LayerEditFieldItem = NativeStackScreenProps<RootStackParamList, 'LayerEditFieldItem'>;

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function Routes() {
  const user = useSelector((state: AppState) => state.user);

  return (
    <NavigationContainer
      documentTitle={{
        formatter: () => `EcorisMap`,
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerTitleAlign: 'center',
        }}
      >
        {FUNC_LOGIN && user.uid === undefined && Platform.OS === 'web' ? (
          <Stack.Screen name="Account" component={Account} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Home" component={Home} options={{ headerShown: false }} />
            <Stack.Screen name="Account" component={Account} options={{ headerShown: false }} />
            <Stack.Screen
              name="AccountSettings"
              component={AccountSettings}
              options={{ title: t('AccountSettings.navigation.title') }}
            />
            <Stack.Screen name="Purchases" component={Purchases} options={{ title: t('Purchases.navigation.title') }} />
            <Stack.Screen name="Settings" component={Settings} options={{ title: t('Settings.navigation.title') }} />
            <Stack.Screen name="Licenses" component={Licenses} options={{ title: t('Licenses.navigation.title') }} />
            <Stack.Screen name="Projects" component={Projects} options={{ title: t('Projects.navigation.title') }} />
            <Stack.Screen
              name="ProjectEdit"
              component={ProjectEdit}
              options={{ title: t('ProjectEdit.navigation.title') }}
            />
            <Stack.Screen name="Data" component={DataRoutes} options={{ title: t('Data.navigation.title') }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
