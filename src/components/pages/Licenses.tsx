import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, FlatList } from 'react-native';
import { COLOR } from '../../constants/AppConstants';

interface Props {
  packageNames: string[];
  pressPackageName: (item: string) => void;
}

export default function Licenses(props: Props) {
  const { packageNames, pressPackageName } = props;

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
      keyExtractor={(item) => item}
      renderItem={({ item }) => {
        return (
          <View style={{ flex: 1, height: 60, flexDirection: 'row' }}>
            <TouchableOpacity
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
            </TouchableOpacity>
          </View>
        );
      }}
    />
  );
}
