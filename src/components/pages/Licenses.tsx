import React, { useCallback, useContext, useEffect } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { LicensesContext } from '../../contexts/Licenses';
import { FlatList } from 'react-native-gesture-handler';
import { useNavigation } from '@react-navigation/native';
import { t } from '../../i18n/config';

export default function Licenses() {
  const { packageNames, pressPackageName } = useContext(LicensesContext);
  const navigation = useNavigation();

  const customHeader = useCallback(
    () => (
      <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 63, backgroundColor: COLOR.MAIN }}>
        <Text style={{ fontSize: 16 }}>{t('Licenses.navigation.title')}</Text>
      </View>
    ),
    []
  );

  useEffect(() => {
    navigation.setOptions({
      header: customHeader,
    });
  }, [customHeader, navigation]);

  const styles = StyleSheet.create({
    td: {
      alignItems: 'center',
      backgroundColor: COLOR.MAIN,
      borderBottomColor: COLOR.GRAY1,
      borderBottomWidth: 1,
      borderRightColor: COLOR.GRAY1,
      borderRightWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 5,
      paddingVertical: 0,
    },
  });

  return (
    <FlatList
      data={packageNames}
      initialNumToRender={packageNames.length}
      keyExtractor={(item) => item}
      renderItem={({ item }) => {
        return (
          <View style={{ flex: 1, height: 60, flexDirection: 'row' }}>
            <Pressable
              style={[styles.td, { flex: 5, width: 150, borderRightWidth: 1 }]}
              onPress={() => pressPackageName(item)}
            >
              <Text
                style={{ flex: 4, padding: 5, textAlign: 'left' }}
                adjustsFontSizeToFit={true}
                //numberOfLines={1}
              >
                {item}
              </Text>
            </Pressable>
          </View>
        );
      }}
    />
  );
}
