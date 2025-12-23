import React, { useCallback, useState } from 'react';
import { FlatList, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CloudLayerGroup } from '../../types';
import { LayerCheckState } from '../../hooks/useCloudDataManagement';
import { CloudDataListItem } from './CloudDataListItem';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';

interface Props {
  layerGroups: CloudLayerGroup[];
  checkStates: LayerCheckState[];
  onChangeLayerChecked: (layerIndex: number, checked: boolean) => void;
  onChangeDataChecked: (layerIndex: number, dataIndex: number, checked: boolean) => void;
  maxHeight?: number;
}

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
};

export const CloudDataList = React.memo((props: Props) => {
  const { layerGroups, checkStates, onChangeLayerChecked, onChangeDataChecked, maxHeight } = props;
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());

  const toggleExpanded = useCallback((layerId: string) => {
    setExpandedLayers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(layerId)) {
        newSet.delete(layerId);
      } else {
        newSet.add(layerId);
      }
      return newSet;
    });
  }, []);

  const keyExtractor = useCallback((item: CloudLayerGroup) => {
    return item.layerId;
  }, []);

  const renderItem = useCallback(
    ({ item, index }: { item: CloudLayerGroup; index: number }) => {
      const checkState = checkStates[index];
      const isExpanded = expandedLayers.has(item.layerId);
      const hasData = item.dataItems.length > 0;

      return (
        <View>
          {/* レイヤ（親）行 */}
          <TouchableOpacity
            style={[styles.layerContainer, item.isOrphan && styles.orphanLayer]}
            onPress={() => hasData && toggleExpanded(item.layerId)}
            activeOpacity={hasData ? 0.7 : 1}
          >
            <View style={styles.checkboxContainer}>
              <TouchableOpacity
                onPress={(e) => {
                  e.stopPropagation();
                  onChangeLayerChecked(index, !checkState?.checked);
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons
                  name={checkState?.checked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
                  size={24}
                  color={COLOR.BLUE}
                />
              </TouchableOpacity>
            </View>
            <View style={styles.expandIconContainer}>
              {hasData ? (
                <MaterialCommunityIcons
                  name={isExpanded ? 'chevron-down' : 'chevron-right'}
                  size={20}
                  color={COLOR.GRAY3}
                />
              ) : (
                <View style={{ width: 20 }} />
              )}
            </View>
            <View style={styles.layerContentContainer}>
              <View style={styles.layerHeaderRow}>
                <MaterialCommunityIcons
                  name={item.isOrphan ? 'folder-alert' : hasData ? 'folder' : 'folder-outline'}
                  size={20}
                  color={item.isOrphan ? COLOR.DARKRED : hasData ? COLOR.BLUE : COLOR.GRAY3}
                  style={styles.folderIcon}
                />
                <Text
                  style={[styles.layerName, item.isOrphan && styles.orphanLayerName, !hasData && styles.emptyLayerName]}
                  numberOfLines={1}
                >
                  {item.layerName}
                </Text>
                <Text style={styles.dataCount}>({item.dataItems.length})</Text>
              </View>
              {item.isOrphan && (
                <View style={styles.warningRow}>
                  <MaterialCommunityIcons name="alert" size={14} color={COLOR.DARKRED} />
                  <Text style={styles.warningText}>{t('CloudDataManagement.label.orphanWarning')}</Text>
                </View>
              )}
              {hasData ? (
                <Text style={styles.infoText}>
                  {t('CloudDataManagement.label.lastUpdated')}: {formatDate(item.lastUpdatedAt)}
                </Text>
              ) : (
                <Text style={styles.emptyDataText}>{t('CloudDataManagement.label.noCloudData')}</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* データ（子）行 - 展開時のみ表示 */}
          {isExpanded &&
            item.dataItems.map((dataItem, dataIndex) => (
              <CloudDataListItem
                key={`${item.layerId}_${dataItem.permission}_${dataItem.userId ?? 'all'}_${dataIndex}`}
                dataItem={dataItem}
                checked={checkState?.dataChecks[dataIndex]?.checked ?? false}
                onChangeChecked={(checked) => onChangeDataChecked(index, dataIndex, checked)}
              />
            ))}
        </View>
      );
    },
    [checkStates, expandedLayers, toggleExpanded, onChangeLayerChecked, onChangeDataChecked]
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
      data={layerGroups}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListEmptyComponent={renderEmpty}
      style={[styles.list, maxHeight !== undefined ? { maxHeight } : undefined]}
      contentContainerStyle={layerGroups.length === 0 ? styles.emptyListContent : undefined}
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
  layerContainer: {
    flexDirection: 'row',
    backgroundColor: COLOR.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.GRAY2,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  orphanLayer: {
    backgroundColor: COLOR.LIGHTRED,
  },
  checkboxContainer: {
    justifyContent: 'center',
    marginRight: 8,
  },
  expandIconContainer: {
    justifyContent: 'center',
    marginRight: 4,
  },
  layerContentContainer: {
    flex: 1,
  },
  layerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  folderIcon: {
    marginRight: 8,
  },
  layerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLOR.BLACK,
    flex: 1,
  },
  orphanLayerName: {
    color: COLOR.DARKRED,
  },
  dataCount: {
    fontSize: 14,
    color: COLOR.GRAY3,
    marginLeft: 8,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  warningText: {
    fontSize: 12,
    color: COLOR.DARKRED,
    marginLeft: 4,
  },
  infoText: {
    fontSize: 12,
    color: COLOR.GRAY3,
  },
  emptyLayerName: {
    color: COLOR.GRAY3,
  },
  emptyDataText: {
    fontSize: 12,
    color: COLOR.GRAY3,
    fontStyle: 'italic',
  },
});
