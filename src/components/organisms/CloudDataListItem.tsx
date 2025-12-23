import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { CloudDataItem } from '../../types';
import { t } from '../../i18n/config';

interface Props {
  dataItem: CloudDataItem;
  checked: boolean;
  onChangeChecked: (checked: boolean) => void;
}

const getPermissionColor = (permission: string): string => {
  switch (permission) {
    case 'PRIVATE':
      return COLOR.BLUE;
    case 'PUBLIC':
      return COLOR.GREEN;
    case 'COMMON':
      return COLOR.ORANGE;
    case 'TEMPLATE':
      return COLOR.DARKBLUE;
    default:
      return COLOR.GRAY3;
  }
};

const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}/${month}/${day} ${hours}:${minutes}`;
};

export const CloudDataListItem = React.memo((props: Props) => {
  const { dataItem, checked, onChangeChecked } = props;
  const permissionColor = getPermissionColor(dataItem.permission);

  return (
    <TouchableOpacity style={styles.container} onPress={() => onChangeChecked(!checked)} activeOpacity={0.7}>
      <View style={styles.indent} />
      <View style={styles.checkboxContainer}>
        <MaterialCommunityIcons
          name={checked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
          size={20}
          color={COLOR.BLUE}
        />
      </View>
      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <MaterialCommunityIcons name="file-document-outline" size={16} color={COLOR.GRAY3} style={styles.fileIcon} />
          <View style={[styles.permissionBadge, { backgroundColor: permissionColor }]}>
            <Text style={styles.permissionText}>{dataItem.permission}</Text>
          </View>
          {dataItem.userEmail && (
            <Text style={styles.userInfo} numberOfLines={1}>
              {dataItem.userEmail}
            </Text>
          )}
        </View>
        <Text style={styles.infoText}>
          {t('CloudDataManagement.label.lastUpdated')}: {formatDate(dataItem.lastUpdatedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLOR.GRAY1,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.GRAY2,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  indent: {
    width: 32,
  },
  checkboxContainer: {
    justifyContent: 'center',
    marginRight: 8,
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  fileIcon: {
    marginRight: 8,
  },
  permissionBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 8,
  },
  permissionText: {
    fontSize: 10,
    color: COLOR.WHITE,
    fontWeight: '600',
  },
  userInfo: {
    fontSize: 12,
    color: COLOR.GRAY3,
    flex: 1,
  },
  infoText: {
    fontSize: 11,
    color: COLOR.GRAY3,
    marginLeft: 24,
  },
});
