import React, { useContext } from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { COLOR } from '../../constants/AppConstants';

import { SmallButton, RectButton2 } from '../atoms';
import { MapsContext } from '../../contexts/Maps';
import { FlatList } from 'react-native-gesture-handler';

export const MapItems = React.memo(() => {
  const { maps, changeMapOrder, changeVisible, pressDownloadMap, pressOpenEditMap, jumpToBoundary, changeExpand } =
    useContext(MapsContext);

  return (
    <FlatList
      style={{ borderTopWidth: 1, borderColor: COLOR.GRAY2 }}
      data={maps}
      initialNumToRender={maps.length}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => {
        if (!item.isGroup && item.groupId && !item.expanded) return null;
        return (
          <View
            style={[
              styles.tr,
              {
                backgroundColor: item.isGroup ? COLOR.KHAKI : COLOR.MAIN,
              },
            ]}
          >
            <View
              style={[
                styles.td,
                { paddingHorizontal: 0, flex: 2, borderRightWidth: item.groupId ? 1 : 0, borderColor: COLOR.GRAY1 },
              ]}
            >
              <View
                style={{
                  alignItems: 'center',
                  height: 56,
                  justifyContent: 'center',
                  flex: 1,
                }}
              >
                {item.isGroup ? (
                  <RectButton2
                    name={item.expanded ? 'chevron-down' : 'chevron-right'}
                    onPress={() => changeExpand(!item.expanded, index)}
                    style={{
                      flex: 1,
                      //width: 80,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: COLOR.KHAKI,
                    }}
                  />
                ) : (
                  <RectButton2
                    name={item.visible ? 'eye' : 'eye-off-outline'}
                    onPress={() => changeVisible(!item.visible, index)}
                    style={{
                      flex: 1,
                      //width: 30,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: COLOR.MAIN,
                    }}
                  />
                )}
              </View>
            </View>
            <TouchableOpacity
              style={[styles.td, { flex: 4 }]}
              onPress={() => {
                //groupの場合はexpandする
                if (item.isGroup) {
                  changeExpand(!item.expanded, index);
                } else {
                  jumpToBoundary(item);
                }
              }}
            >
              <View style={[styles.td2, { flex: 1, justifyContent: 'flex-start' }]}>
                <Text>{item.name}</Text>
              </View>
            </TouchableOpacity>

            {/*************** Edit Button ************************************* */}
            <View style={[styles.td, { flex: 1 }]}>
              {item.id !== 'standard' && item.id !== 'hybrid' && (
                <SmallButton name="pencil" onPress={() => pressOpenEditMap(item)} backgroundColor={COLOR.LIGHTBLUE2} />
              )}
            </View>
            {/*************** Download Button ************************************* */}
            <View style={[styles.td, { flex: 1 }]}>
              {item.id !== 'standard' &&
                item.id !== 'hybrid' &&
                !item.isGroup &&
                !item.url.includes('file://') &&
                !item.url.includes('blob:') && (
                  <SmallButton
                    name="download"
                    onPress={() => pressDownloadMap(item)}
                    borderRadius={5}
                    backgroundColor={COLOR.GRAY3}
                  />
                )}
            </View>

            <View style={[styles.td, { flex: 1 }]}>
              {item.id !== 'standard' && item.id !== 'hybrid' && (
                <RectButton2
                  name="chevron-double-up"
                  onPress={() => changeMapOrder(index)}
                  color={COLOR.GRAY2}
                  style={{ backgroundColor: item.isGroup ? COLOR.KHAKI : COLOR.MAIN }}
                />
              )}
            </View>
          </View>
        );
      }}
    />
  );
});

const styles = StyleSheet.create({
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
    //borderRightWidth: 1,
  },
  td2: {
    alignItems: 'center',
    flex: 2,
    flexDirection: 'row',
    height: 60,
    justifyContent: 'space-evenly',
  },
  tr: {
    flexDirection: 'row',
    height: 60,
  },
});
