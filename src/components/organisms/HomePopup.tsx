import React, { useContext } from 'react';
import { View, TouchableOpacity, ScrollView, Text } from 'react-native';
import { HomeContext } from '../../contexts/Home';
import { COLOR } from '../../constants/AppConstants';
import { FontAwesome } from '@expo/vector-icons';

export const HomePopup = React.memo(() => {
  const { vectorTileInfo, closeVectorTileInfo } = useContext(HomeContext);

  return vectorTileInfo ? (
    <View
      style={{
        position: 'absolute',
        zIndex: 1000,
        elevation: 1000,
        top: vectorTileInfo.position[1] - 110,
        left: vectorTileInfo.position[0] - 100,
      }}
    >
      {/* クローズボタン */}
      <TouchableOpacity
        style={{
          position: 'absolute',
          top: 5,
          right: 5,
          zIndex: 1001, // 吹き出しよりも上に表示
        }}
        onPress={closeVectorTileInfo} // クローズボタンが押されたときの動作
      >
        <FontAwesome name="close" size={24} color="black" />
      </TouchableOpacity>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 8 }}
        style={{
          width: 200,
          height: 100,
          backgroundColor: COLOR.WHITE,
          borderRadius: 5,
        }}
      >
        <Text>{vectorTileInfo.properties}</Text>
      </ScrollView>
      <View
        // eslint-disable-next-line react-native/no-color-literals
        style={{
          alignSelf: 'center',
          width: 10,
          height: 10,
          backgroundColor: 'transparent',
          borderStyle: 'solid',
          borderLeftWidth: 10,
          borderRightWidth: 10,
          borderTopWidth: 10,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: COLOR.WHITE, // 吹き出しと同じ背景色
        }}
      />
    </View>
  ) : null;
});
