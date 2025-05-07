import React, { useContext } from 'react';
import { View, Pressable, Text } from 'react-native';
import { HomeContext } from '../../contexts/Home';
import { COLOR } from '../../constants/AppConstants';
import { FontAwesome } from '@expo/vector-icons';
import { ScrollView } from 'react-native-gesture-handler';

export const HomePopup = React.memo(() => {
  const { vectorTileInfo, closeVectorTileInfo } = useContext(HomeContext);
  const WIDTH = 250;
  const HEIGHT = 120;
  return vectorTileInfo ? (
    <View
      style={{
        position: 'absolute',
        zIndex: 1000,
        elevation: 1000,
        top: vectorTileInfo.position[1] - HEIGHT - 10,
        left: vectorTileInfo.position[0] - WIDTH / 2,
      }}
    >
      {/* クローズボタン */}
      <Pressable
        style={{
          position: 'absolute',
          top: 5,
          right: 5,
          zIndex: 1001, // 吹き出しよりも上に表示
        }}
        onPress={closeVectorTileInfo} // クローズボタンが押されたときの動作
      >
        <FontAwesome name="close" size={24} color="black" />
      </Pressable>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 8 }}
        style={{
          width: WIDTH,
          height: HEIGHT,
          backgroundColor: COLOR.WHITE,
          borderRadius: 5,
        }}
      >
        <ScrollView horizontal={true}>
          <Text>{vectorTileInfo.properties}</Text>
        </ScrollView>
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
