import React, { useContext } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { LicensesContext } from '../../contexts/Licenses';
import { FlatList } from 'react-native-gesture-handler';
import { t } from '../../i18n/config';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';

export default function Licenses() {
  const { packageNames, pressPackageName, gotoBack } = useContext(LicensesContext);

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
    <View style={{ flex: 1 }}>
      <BottomSheetHeader title={t('Licenses.navigation.title')} showBackButton onBack={gotoBack} />
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
    </View>
  );
}
