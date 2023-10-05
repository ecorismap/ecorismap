import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator, NativeStackScreenProps } from '@react-navigation/native-stack';

import { ColorStyle, LayerType, RecordType, RegionType, TileMapType } from '../types';
import Home from '../containers/Home';
import SplitScreen from './split';
import { t } from '../i18n/config';

export type RootStackParamList = {
  Home:
    | {
        tileMap?: TileMapType | undefined;
        jumpTo?: RegionType;
        previous: keyof RootStackParamList;
      }
    | undefined;
  Settings: { previous: keyof RootStackParamList };
  Licenses: { previous: keyof RootStackParamList };
  SplitScreen: undefined;
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
    itemValues?: { value: string; isOther: boolean; customFieldValue: string }[];
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

export type Props_Home = NativeStackScreenProps<RootStackParamList, 'Home'>;
export type Props_Settings = NativeStackScreenProps<RootStackParamList, 'Settings'>;
export type Props_Licenses = NativeStackScreenProps<RootStackParamList, 'Licenses'>;
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
  return (
    <NavigationContainer
      documentTitle={{
        formatter: () => `EcorisMap`,
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerTitleAlign: 'center',
          animation: 'none',
        }}
      >
        <Stack.Screen name="Home" component={Home} options={{ headerShown: false }} />
        <Stack.Screen name="SplitScreen" component={SplitScreen} options={{ title: t('Data.navigation.title') }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
