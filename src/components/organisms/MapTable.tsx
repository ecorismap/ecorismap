import React, { useContext, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { Pressable } from '../atoms/Pressable';
import { MapsContext } from '../../contexts/Maps';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { t } from 'i18next';

// タイトル行
const MapTableTitle = () => (
  <View style={{ flexDirection: 'row', height: 45 }}>
    <View style={[styles.th, { width: '13%' }]}>
      <Text numberOfLines={1}>{t('common.visible')}</Text>
    </View>
    <View style={[styles.th, { width: '65%' }]}>
      <Text numberOfLines={1}>{t('common.name')}</Text>
    </View>

    <View style={[styles.th, { width: '22%' }]}>
      <Text numberOfLines={1}>{t('common.move')}</Text>
    </View>
  </View>
);

export const MapTable = React.memo(() => {
  const {
    maps,
    filterdMaps,
    changeVisible,
    pressDownloadMap,
    gotoMapEdit,
    jumpToBoundary,
    changeExpand,
    pressMapOrder,
    updateMapOrder,
    onDragBegin,
  } = useContext(MapsContext);
  //閉じたグループの子要素を除外する

  // グループごとの子マップ数（折りたたみ時も数えるため全件のmapsから算出）
  const childCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    maps.forEach((m) => {
      if (m.groupId) counts[m.groupId] = (counts[m.groupId] ?? 0) + 1;
    });
    return counts;
  }, [maps]);

  // 各行の描画
  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<any>) => {
      const isParent = item.isGroup;
      const backgroundColor = isActive
        ? COLOR.WHITE
        : isParent
        ? COLOR.GROUP_PARENT_BG
        : item.groupId
        ? COLOR.GROUP_CHILD_BG
        : COLOR.MAIN;
      // 親行の文字・アイコン色。ドラッグ中は白背景になるため濃色に戻す
      const parentFg = isActive ? COLOR.GRAY4 : COLOR.WHITE;
      return (
        <View style={[styles.tr, { backgroundColor }]}>
          {!!item.groupId && !isActive && <View style={styles.childAccent} />}
          <View style={[styles.td, { width: '13%' }]}>
            <View style={{ alignItems: 'center', height: 56, justifyContent: 'center', flex: 1 }}>
              {isParent ? (
                <Button
                  name={item.expanded ? 'chevron-down' : 'chevron-right'}
                  onPress={() => changeExpand(!item.expanded, item)}
                  color={parentFg}
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
            style={[styles.td, { width: '43%' }]}
            onLongPress={item.isGroup && item.expanded ? undefined : drag}
            disabled={isActive}
            onPress={() => {
              if (item.isGroup) {
                changeExpand(!item.expanded, item);
              } else {
                jumpToBoundary(item);
              }
            }}
          >
            <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center' }}>
              {isParent && (
                <MaterialCommunityIcons
                  name={item.expanded ? 'folder-open' : 'folder'}
                  size={18}
                  color={parentFg}
                  style={{ marginRight: 4 }}
                  selectable={undefined}
                />
              )}
              <Text
                style={isParent ? { color: parentFg, fontWeight: 'bold', flexShrink: 1 } : undefined}
                numberOfLines={2}
                ellipsizeMode="tail"
              >
                {isParent ? `${item.name} (${childCounts[item.id] ?? 0})` : item.name}
              </Text>
            </View>
          </Pressable>
          <View style={[styles.td, { width: '11%' }]}>
            {item.id !== 'standard' &&
              item.id !== 'hybrid' &&
              !item.isGroup &&
              (item.url.endsWith('.pdf') || item.url.startsWith('pdf://')) && (
                <Button
                  name="download"
                  onPress={() => pressDownloadMap(item)}
                  borderRadius={5}
                  backgroundColor={COLOR.GRAY3}
                  size={18}
                  labelText={t('Maps.label.pdf')}
                />
              )}
          </View>
          <View style={[styles.td, { width: '11%' }]}>
            {item.id !== 'standard' && item.id !== 'hybrid' && (
              <Button
                name="pencil"
                onPress={() => gotoMapEdit(item)}
                backgroundColor={COLOR.GRAY3}
                size={18}
                labelText={t('Maps.label.edit')}
                borderRadius={5}
              />
            )}
          </View>
          <View style={[styles.td, { width: '22%', flexDirection: 'row', justifyContent: 'center' }]}>
            {item.id !== 'standard' && item.id !== 'hybrid' && (
              <>
                <Button
                  name="chevron-up"
                  onPress={() => pressMapOrder(item, 'up')}
                  color={isParent ? parentFg : COLOR.GRAY2}
                  style={{ backgroundColor }}
                />
                <Button
                  name="chevron-down"
                  onPress={() => pressMapOrder(item, 'down')}
                  color={isParent ? parentFg : COLOR.GRAY2}
                  style={{ backgroundColor }}
                />
              </>
            )}
          </View>
        </View>
      );
    },
    [changeExpand, changeVisible, childCounts, gotoMapEdit, jumpToBoundary, pressMapOrder, pressDownloadMap]
  );

  const keyExtractor = useCallback((item: any) => item.id, []);

  // ListHeaderComponentをメモ化（不要な再マウントを防止）
  const ListHeader = React.useMemo(() => <MapTableTitle />, []);

  return (
    // @ts-ignore - react-native-draggable-flatlist is not compatible with React 19 types
    <DraggableFlatList<any>
      data={filterdMaps}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={ListHeader}
      stickyHeaderIndices={[0]}
      initialNumToRender={10}
      maxToRenderPerBatch={10}
      windowSize={3}
      removeClippedSubviews
      activationDistance={5}
      onDragBegin={(index) => onDragBegin(filterdMaps[index])}
      onDragEnd={({ from, to }) => updateMapOrder(filterdMaps, from, to > from ? to + 1 : to)}
      getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })}
    />
  );
});

const styles = StyleSheet.create({
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  tr: {
    flexDirection: 'row',
    height: 60,
  },
  childAccent: {
    backgroundColor: COLOR.GROUP_ACCENT,
    borderRadius: 2,
    bottom: 8,
    left: 6,
    position: 'absolute',
    top: 8,
    width: 3,
    zIndex: 1,
  },
  th: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderColor: COLOR.GRAY2,
    borderRightWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 0,
  },
});
