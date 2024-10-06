import React, { useContext } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, Platform } from 'react-native';
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
                borderTopWidth: item.isGroup && item.expanded ? 1 : 0,
                backgroundColor: item.isGroup ? COLOR.GRAY1 : COLOR.MAIN,
                borderBottomWidth: item.groupId && !maps[index + 1].groupId && !maps[index + 1].isGroup ? 1 : 0,
              },
            ]}
          >
            <View style={[styles.td, { paddingHorizontal: 0, flex: 3 }]}>
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
                      width: 38,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: COLOR.GRAY1,
                      //borderRightWidth: 1,
                    }}
                  />
                ) : (
                  <View
                    style={{
                      flex: 1,
                      width: 38,
                      alignItems: 'center',
                      justifyContent: 'center',
                      //backgroundColor: item.groupId ? COLOR.GRAY1: COLOR.MAIN,
                      borderRightWidth: item.groupId ? 1 : 0,
                      borderStyle: 'dashed',
                      alignSelf: Platform.OS === 'web' ? 'stretch' : 'auto',
                    }}
                  />
                )}
              </View>
              <View style={[styles.td2, { flex: 2 }]}>
                {!item.isGroup && (
                  <RectButton2
                    name={item.visible ? 'eye' : 'eye-off-outline'}
                    onPress={() => changeVisible(!item.visible, index)}
                    style={{ backgroundColor: item.isGroup ? COLOR.GRAY1 : COLOR.MAIN }}
                  />
                )}
              </View>
            </View>
            <TouchableOpacity style={[styles.td, { flex: 3 }]} onPress={() => jumpToBoundary(item)}>
              <View style={[styles.td2, { flex: 4, justifyContent: 'flex-start' }]}>
                <Text>{item.name}</Text>
              </View>
            </TouchableOpacity>

            {/*************** Edit Button ************************************* */}
            <View style={[styles.td, { flex: 1 }]}>
              {item.id !== 'standard' && item.id !== 'hybrid' && (
                <SmallButton
                  name="pencil"
                  onPress={() => pressOpenEditMap(item)}
                  backgroundColor={item.isGroup ? COLOR.GRAY2 : COLOR.GRAY2}
                />
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
                  style={{ backgroundColor: item.isGroup ? COLOR.GRAY1 : COLOR.MAIN }}
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
