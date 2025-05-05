import React, { useContext, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { MapsContext } from '../../contexts/Maps';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { t } from 'i18next';

// タイトル行
const MapTableTitle = () => (
  <View style={{ flexDirection: 'row', height: 45 }}>
    <View style={[styles.th, { flex: 1, width: 80 }]}>
      <Text>{t('common.visible')}</Text>
    </View>
    <View style={[styles.th, { flex: 4 }]}>
      <Text>{t('common.name')}</Text>
    </View>
    <View style={[styles.th, { flex: 1, width: 80 }]}>
      <Text>{t('common.edit')}</Text>
    </View>
    <View style={[styles.th, { flex: 1, width: 80 }]}>
      <Text>{t('common.download')}</Text>
    </View>
    <View style={[styles.th, { flex: 2, width: 80 }]}>
      <Text>{t('common.move')}</Text>
    </View>
  </View>
);

export const MapTable = React.memo(() => {
  const {
    maps,
    changeVisible,
    pressDownloadMap,
    pressOpenEditMap,
    jumpToBoundary,
    changeExpand,
    pressMapOrder,
    updateMapOrder,
    onDragBegin,
  } = useContext(MapsContext);
  //閉じたグループの子要素を除外する

  const filterdMaps = useMemo(
    () => maps.filter((map) => map.isGroup || (map.groupId && map.expanded) || !map.groupId),
    [maps]
  );

  // 各行の描画
  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<any>) => {
      const backgroundColor = isActive
        ? COLOR.WHITE
        : item.isGroup
        ? COLOR.KHAKI
        : item.groupId
        ? COLOR.LIGHTKHAKI
        : COLOR.MAIN;
      return (
        <View style={[styles.tr, { backgroundColor }]}>
          <View
            style={[
              styles.td,
              {
                flex: 1,
                width: 80,
                borderRightWidth: item.groupId ? 1 : 0,
                borderColor: COLOR.GRAY1,
              },
            ]}
          >
            <View style={{ alignItems: 'center', height: 56, justifyContent: 'center', flex: 1 }}>
              {item.isGroup ? (
                <Button
                  name={item.expanded ? 'chevron-down' : 'chevron-right'}
                  onPress={() => changeExpand(!item.expanded, item)}
                  color={COLOR.GRAY4}
                  size={25}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor }}
                />
              ) : (
                <Button
                  name={item.visible ? 'eye' : 'eye-off-outline'}
                  onPress={() => changeVisible(!item.visible, item)}
                  color={COLOR.GRAY4}
                  size={25}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor }}
                />
              )}
            </View>
          </View>
          <Pressable
            style={[styles.td, { flex: 4 }]}
            onLongPress={drag}
            disabled={isActive}
            onPress={() => {
              if (item.isGroup) {
                changeExpand(!item.expanded, item);
              } else {
                jumpToBoundary(item);
              }
            }}
          >
            <View style={{ flex: 1 }}>
              <Text>{item.name}</Text>
            </View>
          </Pressable>
          <View style={[styles.td, { flex: 1, width: 80 }]}>
            {item.id !== 'standard' && item.id !== 'hybrid' && (
              <Button
                name="pencil"
                onPress={() => pressOpenEditMap(item)}
                backgroundColor={COLOR.LIGHTBLUE2}
                size={18}
                labelText={t('Maps.label.edit')}
              />
            )}
          </View>
          <View style={[styles.td, { flex: 1, width: 80 }]}>
            {item.id !== 'standard' &&
              item.id !== 'hybrid' &&
              !item.isGroup &&
              !item.url.includes('file://') &&
              !item.url.includes('blob:') && (
                <Button
                  name="download"
                  onPress={() => pressDownloadMap(item)}
                  borderRadius={5}
                  backgroundColor={COLOR.GRAY3}
                  size={18}
                  labelText={t('Maps.label.download')}
                />
              )}
          </View>
          <View style={[styles.td, { flex: 2, width: 80, flexDirection: 'row', justifyContent: 'center' }]}>
            {item.id !== 'standard' && item.id !== 'hybrid' && (
              <>
                <Button
                  name="chevron-up"
                  onPress={() => pressMapOrder(item, 'up')}
                  color={COLOR.GRAY2}
                  style={{ backgroundColor }}
                />
                <Button
                  name="chevron-down"
                  onPress={() => pressMapOrder(item, 'down')}
                  color={COLOR.GRAY2}
                  style={{ backgroundColor }}
                />
              </>
            )}
          </View>
        </View>
      );
    },
    [changeExpand, changeVisible, pressOpenEditMap, pressDownloadMap, jumpToBoundary, pressMapOrder]
  );

  const keyExtractor = useCallback((item: any) => item.id, []);

  return (
    <DraggableFlatList
      data={filterdMaps}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={<MapTableTitle />}
      stickyHeaderIndices={[0]}
      initialNumToRender={filterdMaps.length}
      onDragBegin={(index) => onDragBegin(filterdMaps[index])}
      onDragEnd={({ from, to }) => updateMapOrder(filterdMaps, from, to > from ? to + 1 : to)}
      activationDistance={5}
      removeClippedSubviews
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
  },
  tr: {
    flexDirection: 'row',
    height: 60,
  },
  th: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderColor: COLOR.GRAY2,
    borderRightWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
});
