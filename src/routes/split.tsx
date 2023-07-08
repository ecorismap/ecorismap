import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Layers from '../containers/Layers';
import Data from '../containers/Data';
import DataEdit from '../containers/DataEdit';
import LayerEdit from '../containers/LayerEdit';
import LayerEditFeatureStyle from '../containers/LayerEditFeatureStyle';
import LayerEditFieldItem from '../containers/LayerEditFieldItem';
import { RootStackParamList } from '.';
import { COLOR } from '../constants/AppConstants';
import Maps from '../containers/Maps';
import MapList from '../containers/MapList';
import { t } from '../i18n/config';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function SplitScreen() {
  return (
    // <NavigationContainer independent={true}>
    <Stack.Navigator
      screenOptions={{
        headerShadowVisible: false,
        //headerTintColor: 'white',
        headerStyle: { backgroundColor: COLOR.MAIN },
        headerTitleStyle: { fontSize: 16 },
        headerTitleAlign: 'center',
        animation: 'none',
      }}
    >
      <Stack.Screen name="Maps" component={Maps} options={{ title: t('Maps.navigation.title') }} />
      <Stack.Screen name="MapList" component={MapList} options={{ title: t('MapList.navigation.title') }} />
      <Stack.Screen name="Layers" component={Layers} options={{ title: t('Layers.navigation.title') }} />
      <Stack.Screen name="Data" component={Data} options={{ title: t('Data.navigation.title') }} />
      <Stack.Screen name="DataEdit" component={DataEdit} options={{ title: t('DataEdit.navigation.title') }} />
      <Stack.Screen name="LayerEdit" component={LayerEdit} options={{ title: t('LayerEdit.navigation.title') }} />
      <Stack.Screen
        name="LayerEditFeatureStyle"
        component={LayerEditFeatureStyle}
        options={{ title: t('LayerEditFeatureStyle.navigation.title') }}
      />
      <Stack.Screen
        name="LayerEditFieldItem"
        component={LayerEditFieldItem}
        options={{ title: t('LayerEditFieldItem.navigation.title') }}
      />
    </Stack.Navigator>
    // {/* </NavigationContainer> */}
  );
}
