import React, { useCallback, useContext } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { TileMapItemType } from '../../types';
import { t } from '../../i18n/config';
import { MapListContext } from '../../contexts/MapList';
import { FlatList } from 'react-native-gesture-handler';

export const MapListTable = React.memo(() => {
  const { data, addMap } = useContext(MapListContext);

  const titles = [
    t('common.name'),
    t('common.url'),
    t('common.sourceName'),
    t('common.transparency'),
    t('common.fixZoom'),
    t('common.highResolution'),
    t('common.minZoom'),
    t('common.maxZoom'),
    t('common.Yaxis'),
  ];
  //@ts-ignore
  const renderItem = useCallback(({ item }) => <MapListTableComponent item={item} addMap={addMap} />, [addMap]);
  const keyExtractor = useCallback((item: TileMapItemType) => item.url, []);

  return (
    <View style={{ flexDirection: 'column', flex: 1, marginBottom: 10 }}>
      <View style={{ height: 45, flexDirection: 'row' }}>
        <View style={[styles.th, { width: 60 }]}>
          <Text>{`${t('common.add')}`}</Text>
        </View>

        {titles.map((title, idx) => (
          <View key={idx} style={[styles.th, { flex: 2, width: 120 }]}>
            <Text adjustsFontSizeToFit={true} numberOfLines={2}>
              {title}
            </Text>
          </View>
        ))}
      </View>
      <FlatList
        data={data}
        initialNumToRender={data.length}
        extraData={data}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
      />
    </View>
  );
});

interface Props_MapListTableComponent {
  item: TileMapItemType;
  addMap: (map: TileMapItemType) => void;
}

const MapListTableComponent = React.memo(({ item, addMap }: Props_MapListTableComponent) => {
  //console.log('render renderItems');
  //console.log(item);
  return (
    <View style={{ flex: 1, height: 45, flexDirection: 'row' }}>
      <View style={[styles.td, { width: 60 }]}>
        <Button
          color={COLOR.GRAY4}
          style={{ backgroundColor: COLOR.MAIN }}
          borderRadius={0}
          name={'plus-thick'}
          onPress={() => addMap(item)}
        />
      </View>

      {Object.values(item).map((value, idx) => (
        <View key={idx} style={[styles.td, { flex: 2, width: 120 }]}>
          <Text adjustsFontSizeToFit={true} numberOfLines={2}>
            {value.toString()}
          </Text>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    //flex: 1,
    //flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
    //borderRightWidth: 1,
  },
  th: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderColor: COLOR.GRAY2,
    borderRightWidth: 1,
    //flex: 1,
    // flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
});
