import React, { useContext } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { InfoToolContext } from '../../contexts/InfoTool';
import { COLOR } from '../../constants/AppConstants';
import { ScrollView } from 'react-native-gesture-handler';
import { MaterialIcons } from '@expo/vector-icons';

export const HomePopup = React.memo(() => {
  const { vectorTileInfo, closeVectorTileInfo } = useContext(InfoToolContext);
  const WIDTH = 200;
  const HEIGHT = 150;

  // プロパティを表示用に整形
  const renderProperties = () => {
    if (!vectorTileInfo?.properties || vectorTileInfo.properties.length === 0) return null;

    return vectorTileInfo.properties.map((property, groupIndex) => (
      <View key={groupIndex}>
        {groupIndex > 0 && (
          <View
            style={{
              height: 1,
              backgroundColor: COLOR.GRAY1,
              marginVertical: 6,
              marginHorizontal: -12,
            }}
          />
        )}
        {Object.entries(property).map(([key, value], index) => (
          <View key={`${groupIndex}-${index}`} style={{ marginBottom: 4 }}>
            <Text
              style={{
                fontSize: 11,
                color: COLOR.GRAY2,
                marginBottom: 1,
                fontWeight: '600',
                textTransform: 'capitalize',
              }}
            >
              {key.replace(/_/g, ' ')}
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: COLOR.BLACK,
                lineHeight: 16,
              }}
            >
              {value !== null && value !== undefined ? String(value) : '-'}
            </Text>
          </View>
        ))}
      </View>
    ));
  };

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
      <View
        style={{
          width: WIDTH,
          maxHeight: HEIGHT,
          backgroundColor: COLOR.WHITE,
          borderRadius: 8,
          shadowColor: COLOR.BLACK,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          elevation: 3,
        }}
      >
        <TouchableOpacity
          style={{
            position: 'absolute',
            top: 4,
            right: 4,
            zIndex: 1,
            width: 20,
            height: 20,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onPress={closeVectorTileInfo}
        >
          <MaterialIcons name="close" size={16} color={COLOR.GRAY2} />
        </TouchableOpacity>
        <ScrollView
          contentContainerStyle={{ padding: 12, paddingTop: 20 }}
          style={{
            width: WIDTH,
            maxHeight: HEIGHT,
          }}
          showsVerticalScrollIndicator={true}
        >
          {renderProperties()}
        </ScrollView>
      </View>
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
