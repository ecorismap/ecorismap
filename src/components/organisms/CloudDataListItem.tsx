import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { CloudDataGroup } from '../../types';
import { t } from '../../i18n/config';

interface Props {
  group: CloudDataGroup;
  checked: boolean;
  onChangeChecked: (checked: boolean) => void;
}

const getPermissionColor = (permission: string, isOrphan: boolean): string => {
  if (isOrphan) return COLOR.DARKRED;
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
  const { group, checked, onChangeChecked } = props;
  const isOrphan = group.type === 'orphan';
  const permissionColor = getPermissionColor(group.permission, isOrphan);

  return (
    <TouchableOpacity style={styles.container} onPress={() => onChangeChecked(!checked)} activeOpacity={0.7}>
      <View style={styles.checkboxContainer}>
        <MaterialCommunityIcons
          name={checked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
          size={24}
          color={COLOR.BLUE}
        />
      </View>
      <View style={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Text style={styles.layerName} numberOfLines={1}>
            {group.layerName}
          </Text>
          <View style={[styles.permissionBadge, { backgroundColor: permissionColor }]}>
            <Text style={styles.permissionText}>{group.permission}</Text>
          </View>
        </View>
        {group.type === 'user' && group.userEmail && (
          <Text style={styles.userInfo} numberOfLines={1}>
            {t('CloudDataManagement.label.user')}: {group.userEmail}
          </Text>
        )}
        {isOrphan && (
          <View style={styles.warningRow}>
            <MaterialCommunityIcons name="alert" size={14} color={COLOR.DARKRED} />
            <Text style={styles.warningText}>{t('CloudDataManagement.label.orphanWarning')}</Text>
          </View>
        )}
        <Text style={styles.infoText}>
          {t('CloudDataManagement.label.lastUpdated')}: {formatDate(group.lastUpdatedAt)}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: COLOR.WHITE,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.GRAY2,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  checkboxContainer: {
    justifyContent: 'center',
    marginRight: 12,
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  layerName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLOR.BLACK,
    flex: 1,
    marginRight: 8,
  },
  permissionBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  permissionText: {
    fontSize: 10,
    color: COLOR.WHITE,
    fontWeight: '600',
  },
  userInfo: {
    fontSize: 13,
    color: COLOR.GRAY3,
    marginBottom: 4,
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
});
