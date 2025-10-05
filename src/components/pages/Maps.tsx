import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Platform, Text } from 'react-native';
import { COLOR, MAPS_BTN } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { MapButtons } from '../organisms/MapButttons';
import { MapTable } from '../organisms/MapTable';
import { useNavigation } from '@react-navigation/native';
import { MapsContext } from '../../contexts/Maps';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { StackNavigationProp } from '@react-navigation/stack';
import { RootStackParamList } from '../../routes';

type NavigationProp = StackNavigationProp<RootStackParamList>;

export default function MapScreen() {
  //console.log('render Maps');
  const { progress, isLoading, isOffline, pressToggleOnline } = useContext(MapsContext);
  const navigation = useNavigation<NavigationProp>();

  const customHeader = useCallback(
    () => (
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: 63,
          backgroundColor: COLOR.MAIN,
        }}
      >
        <View
          style={{ flex: 1, justifyContent: 'flex-start', alignItems: 'center', flexDirection: 'row', paddingLeft: 10 }}
        >
          {Platform.OS !== 'web' && (
            <Button
              name={isOffline ? MAPS_BTN.OFFLINE : MAPS_BTN.ONLINE}
              backgroundColor={isOffline ? 'red' : COLOR.LIGHTBLUE2}
              onPress={pressToggleOnline}
              labelText={isOffline ? t('Maps.label.offline') : t('Maps.label.online')}
              size={20}
              borderRadius={50}
            />
          )}
        </View>
        <View style={{ flex: 2, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 16 }}>{t('Maps.navigation.title')}</Text>
        </View>
        <View
          style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', flexDirection: 'row', paddingRight: 10 }}
        >
          <Button
            name="arrow-right"
            backgroundColor={COLOR.MAIN}
            onPress={() => navigation.navigate('Home', { mode: 'download', previous: 'Maps' })}
            labelText={t('Home.navigation.download')}
            labelTextColor={COLOR.GRAY3}
            size={25}
            color={COLOR.GRAY3}
            borderRadius={5}
            borderWidth={1}
            borderColor={COLOR.GRAY3}
            style={{ width: 80, marginLeft: 'auto' }}
          />
        </View>
      </View>
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isOffline, navigation, pressToggleOnline, t]
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

  return (
    <View style={styles.container}>
      <Loading visible={isLoading} text={t('common.processing') + '\n' + progress + '%'} />
      <View style={{ flex: 1 }}>
        <MapTable />
      </View>
      <MapButtons />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
