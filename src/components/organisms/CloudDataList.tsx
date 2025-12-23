import React, { useCallback } from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import { CloudDataGroup } from '../../types';
import { CloudDataListItem } from './CloudDataListItem';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';

interface Props {
  dataGroups: CloudDataGroup[];
  checkList: { id: number; checked: boolean }[];
  onChangeChecked: (index: number, checked: boolean) => void;
  maxHeight?: number;
}

export const CloudDataList = React.memo((props: Props) => {
  const { dataGroups, checkList, onChangeChecked, maxHeight } = props;

  const keyExtractor = useCallback((item: CloudDataGroup, index: number) => {
    return `${item.layerId}_${item.userId ?? 'all'}_${index}`;
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: CloudDataGroup; index: number }) => {
      return (
        <CloudDataListItem
          group={item}
          checked={checkList[index]?.checked ?? false}
          onChangeChecked={(checked) => onChangeChecked(index, checked)}
        />
      );
    },
    [checkList, onChangeChecked]
  );

  const renderEmpty = useCallback(() => {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t('CloudDataManagement.label.noData')}</Text>
      </View>
    );
  }, []);

  return (
    <FlatList
      data={dataGroups}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListEmptyComponent={renderEmpty}
      style={[styles.list, maxHeight !== undefined ? { maxHeight } : undefined]}
      contentContainerStyle={dataGroups.length === 0 ? styles.emptyListContent : undefined}
    />
  );
});

const styles = StyleSheet.create({
  list: {
    flex: 1,
    backgroundColor: COLOR.GRAY2,
  },
  emptyListContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    padding: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: COLOR.GRAY3,
  },
});
