import React, { useCallback, useContext, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { ProjectsButtons } from '../organisms/ProjectsButtons';
import { Loading } from '../molecules/Loading';
import { t } from '../../i18n/config';
import { ProjectsContext } from '../../contexts/Projects';
import { ProjectsModalEncryptPassword } from '../organisms/ProjectsModalEncryptPassword';
import { ProjectType } from '../../types';
import { ListRenderItemInfo } from 'react-native';

type SortField = 'name' | 'abstract' | 'storage' | 'encryptedAt' | 'owner' | 'archived';
type SortOrder = 'ASCENDING' | 'DESCENDING' | 'UNSORTED';

export default function Projects() {
  const {
    projects,
    user,
    isLoading,
    isEncryptPasswordModalOpen,
    favoriteProjectIds,
    showOnlyFavorites,
    isShowArchive,
    pressEncryptPasswordOK,
    pressEncryptPasswordCancel,
    onReloadProjects,
    pressAddProject,
    gotoProject,
    gotoBack,
    toggleFavorite,
    toggleShowOnlyFavorites,
    toggleShowArchive,
    pressArchiveProject,
    pressRestoreProject,
    dekMigratableCount,
    migrationProgress,
    pressMigrateProjects,
  } = useContext(ProjectsContext);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // Web用: ヘッダー(56 + insets.top) + テーブルヘッダー(45) + ボタン(約60) + マージンを引く
  const tableHeight = windowHeight - (56 + insets.top) - 45 - 60 - insets.bottom - 20;

  const [sortField, setSortField] = useState<SortField>('encryptedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('DESCENDING');

  const handleSort = useCallback(
    (field: SortField) => {
      if (field === sortField) {
        setSortOrder(sortOrder === 'UNSORTED' ? 'DESCENDING' : sortOrder === 'DESCENDING' ? 'ASCENDING' : 'UNSORTED');
      } else {
        setSortField(field);
        setSortOrder('DESCENDING');
      }
    },
    [sortField, sortOrder]
  );

  const filteredProjects = useMemo(() => {
    let result = projects;
    // アーカイブ表示OFFのときはアーカイブ済みを隠す（読み込み自体も除外済みなので基本は保険）
    if (!isShowArchive) {
      result = result.filter((p) => p.archived !== true);
    }
    if (showOnlyFavorites) {
      result = result.filter((p) => favoriteProjectIds.includes(p.id));
    }
    return result;
  }, [projects, isShowArchive, showOnlyFavorites, favoriteProjectIds]);

  const sortedProjects = useMemo(() => {
    if (sortOrder === 'UNSORTED') return filteredProjects;

    const sorted = [...filteredProjects].sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'abstract':
          aValue = a.abstract;
          bValue = b.abstract;
          break;
        case 'storage':
          aValue = a.storage?.count || 0;
          bValue = b.storage?.count || 0;
          break;
        case 'encryptedAt':
          aValue = a.settingsEncryptedAt ? new Date(a.settingsEncryptedAt).getTime() : 0;
          bValue = b.settingsEncryptedAt ? new Date(b.settingsEncryptedAt).getTime() : 0;
          break;
        case 'owner':
          aValue = a.ownerUid === user.uid ? 1 : 0;
          bValue = b.ownerUid === user.uid ? 1 : 0;
          break;
        case 'archived': {
          // アーカイブ列はセルの表示内容の3状態で並べる:
          // アーカイブできる(2) > 操作不可=空欄(1) > 復元できる=アーカイブ済み(0)
          const archiveRank = (p: ProjectType) => {
            const isOwnerAdmin = !!user.uid && (p.ownerUid === user.uid || (p.adminsUid ?? []).includes(user.uid));
            if (!isOwnerAdmin) return 1;
            return p.archived ? 0 : 2;
          };
          aValue = archiveRank(a);
          bValue = archiveRank(b);
          break;
        }
      }

      if (aValue < bValue) return sortOrder === 'ASCENDING' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'ASCENDING' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredProjects, sortField, sortOrder, user.uid]);

  // テーブルヘッダー（カラム名）のレンダリング
  const renderTableHeader = useCallback(() => (
    <View style={{ flexDirection: 'row', height: 45 }}>
      <Pressable style={[styles.th, { width: 40 }]} onPress={toggleShowOnlyFavorites}>
        <MaterialCommunityIcons
          name={showOnlyFavorites ? 'star' : 'star-outline'}
          size={20}
          color={showOnlyFavorites ? COLOR.YELLOW : COLOR.GRAY4}
        />
      </Pressable>
      <Pressable style={[styles.th, { flex: 3, width: 140 }]} onPress={() => handleSort('name')}>
        <Text style={{ color: COLOR.TEXT_DARK }}>{`${t('common.projectName')}`}</Text>
        {sortField === 'name' && sortOrder === 'ASCENDING' && (
          <MaterialCommunityIcons name="sort-alphabetical-ascending" size={16} color={COLOR.TEXT_DARK} />
        )}
        {sortField === 'name' && sortOrder === 'DESCENDING' && (
          <MaterialCommunityIcons name="sort-alphabetical-descending" size={16} color={COLOR.TEXT_DARK} />
        )}
      </Pressable>
      <Pressable style={[styles.th, { flex: 2, width: 120 }]} onPress={() => handleSort('abstract')}>
        <Text style={{ color: COLOR.TEXT_DARK }}>{`${t('common.overview')}`}</Text>
        {sortField === 'abstract' && sortOrder === 'ASCENDING' && (
          <MaterialCommunityIcons name="sort-alphabetical-ascending" size={16} color={COLOR.TEXT_DARK} />
        )}
        {sortField === 'abstract' && sortOrder === 'DESCENDING' && (
          <MaterialCommunityIcons name="sort-alphabetical-descending" size={16} color={COLOR.TEXT_DARK} />
        )}
      </Pressable>
      <Pressable style={[styles.th, { flex: 2, width: 120 }]} onPress={() => handleSort('encryptedAt')}>
        <Text style={{ color: COLOR.TEXT_DARK }}>{`${t('common.updatedAt')}`}</Text>
        {sortField === 'encryptedAt' && sortOrder === 'ASCENDING' && (
          <MaterialCommunityIcons name="sort-calendar-ascending" size={16} color={COLOR.TEXT_DARK} />
        )}
        {sortField === 'encryptedAt' && sortOrder === 'DESCENDING' && (
          <MaterialCommunityIcons name="sort-calendar-descending" size={16} color={COLOR.TEXT_DARK} />
        )}
      </Pressable>
      <Pressable style={[styles.th, { flex: 2, width: 100 }]} onPress={() => handleSort('owner')}>
        <Text style={{ color: COLOR.TEXT_DARK }}>{`${t('common.owner')}`}</Text>
        {sortField === 'owner' && sortOrder === 'ASCENDING' && (
          <MaterialCommunityIcons name="sort-bool-ascending" size={16} color={COLOR.TEXT_DARK} />
        )}
        {sortField === 'owner' && sortOrder === 'DESCENDING' && (
          <MaterialCommunityIcons name="sort-bool-descending" size={16} color={COLOR.TEXT_DARK} />
        )}
      </Pressable>
      <Pressable style={[styles.th, { flex: 2, width: 120 }]} onPress={() => handleSort('storage')}>
        <Text style={{ color: COLOR.TEXT_DARK }}>{`${t('common.usage')}`}</Text>
        {sortField === 'storage' && sortOrder === 'ASCENDING' && (
          <MaterialCommunityIcons name="sort-numeric-ascending" size={16} color={COLOR.TEXT_DARK} />
        )}
        {sortField === 'storage' && sortOrder === 'DESCENDING' && (
          <MaterialCommunityIcons name="sort-numeric-descending" size={16} color={COLOR.TEXT_DARK} />
        )}
      </Pressable>
      {Platform.OS === 'web' && (
        <Pressable style={[styles.th, { width: 90 }]} onPress={() => handleSort('archived')}>
          <Text numberOfLines={1} style={{ color: COLOR.TEXT_DARK }}>{`${t('Projects.label.archive')}`}</Text>
          {sortField === 'archived' && sortOrder === 'ASCENDING' && (
            <MaterialCommunityIcons name="sort-bool-ascending" size={16} color={COLOR.TEXT_DARK} />
          )}
          {sortField === 'archived' && sortOrder === 'DESCENDING' && (
            <MaterialCommunityIcons name="sort-bool-descending" size={16} color={COLOR.TEXT_DARK} />
          )}
        </Pressable>
      )}
    </View>
  ), [handleSort, showOnlyFavorites, sortField, sortOrder, toggleShowOnlyFavorites]);

  // renderItemをメモ化（不要な再生成を防止）
  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<ProjectType>) => {
      const isOwnerAdmin = !!user.uid && (item.ownerUid === user.uid || (item.adminsUid ?? []).includes(user.uid));
      const showActions = Platform.OS === 'web' && isOwnerAdmin;
      const textColor = item.archived ? COLOR.GRAY4 : COLOR.TEXT_DARK;
      return (
      <Pressable
        key={index}
        style={{
          flex: 1,
          height: 45,
          flexDirection: 'row',
        }}
        onPress={() => gotoProject(item.id)}
      >
        <Pressable
          style={[styles.td, { width: 40, alignItems: 'center' }]}
          onPress={() => toggleFavorite(item.id)}
        >
          <MaterialCommunityIcons
            name={favoriteProjectIds.includes(item.id) ? 'star' : 'star-outline'}
            size={20}
            color={favoriteProjectIds.includes(item.id) ? '#FFD700' : COLOR.GRAY4}
          />
        </Pressable>
        <View style={[styles.td, { flex: 3, width: 140 }]}>
          <Text
            adjustsFontSizeToFit={true}
            numberOfLines={2}
            onPress={() => gotoProject(item.id)}
            testID={`project-${index}`}
            style={{ color: textColor }}
          >
            {item.name}
          </Text>
        </View>
        <View style={[styles.td, { flex: 2, width: 120 }]}>
          <Text adjustsFontSizeToFit={true} numberOfLines={2} style={{ color: COLOR.TEXT_DARK }}>
            {item.abstract}
          </Text>
        </View>
        <View style={[styles.td, { flex: 2, width: 120, alignItems: 'center' }]}>
          <Text adjustsFontSizeToFit={true} numberOfLines={2} style={{ color: COLOR.TEXT_DARK }}>
            {item.settingsEncryptedAt
              ? new Date(item.settingsEncryptedAt).toLocaleString('ja-JP', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '-'}
          </Text>
        </View>
        <View style={[styles.td, { flex: 2, width: 100, alignItems: 'center' }]}>
          {item.ownerUid === user.uid && (
            <MaterialCommunityIcons name="crown" size={18} color={COLOR.GRAY4} />
          )}
        </View>
        <View style={[styles.td, { flex: 2, width: 120, alignItems: 'flex-end' }]}>
          <Text adjustsFontSizeToFit={true} numberOfLines={2} style={{ color: COLOR.TEXT_DARK }}>
            {`${item.storage !== undefined ? (item.storage.count / (1024 * 1024 * 1024)).toFixed(2) : 0}GB`}
          </Text>
        </View>
        {Platform.OS === 'web' && (
          <View style={[styles.td, { width: 90, alignItems: 'center' }]}>
            {showActions && (
              <Pressable
                style={{ padding: 5 }}
                onPress={() => (item.archived ? pressRestoreProject(item.id) : pressArchiveProject(item.id))}
                testID={`archive-toggle-${index}`}
              >
                <MaterialCommunityIcons
                  name={item.archived ? 'archive-arrow-up' : 'archive-arrow-down'}
                  size={20}
                  color={item.archived ? COLOR.BLUE : COLOR.GRAY4}
                />
              </Pressable>
            )}
          </View>
        )}
      </Pressable>
      );
    },
    [favoriteProjectIds, gotoProject, pressArchiveProject, pressRestoreProject, toggleFavorite, user.uid]
  );

  return (
    <View style={styles.container}>
      {/* Custom Header */}
      <View style={[styles.header, { height: 56 + insets.top, paddingTop: insets.top }]}>
        <TouchableOpacity style={{ padding: 5 }} onPress={gotoBack}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLOR.BLACK} />
        </TouchableOpacity>
        <Text style={{ fontSize: 16, color: COLOR.TEXT_DARK }}>{t('Projects.navigation.title')}</Text>
        {Platform.OS === 'web' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {dekMigratableCount > 0 && (
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, marginRight: 15 }}
                onPress={pressMigrateProjects}
                testID="migrate-dek-projects"
              >
                <MaterialCommunityIcons name="shield-refresh-outline" size={20} color={COLOR.BLUE} />
                <Text style={{ fontSize: 12, color: COLOR.BLUE, marginLeft: 2 }}>
                  {t('Projects.label.migrateDek', { num: dekMigratableCount })}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5 }}
              onPress={toggleShowArchive}
              testID="toggle-show-archive"
            >
              <Text style={{ fontSize: 12, color: isShowArchive ? COLOR.BLUE : COLOR.GRAY4, marginRight: 2 }}>
                {t('Projects.label.includeArchive')}
              </Text>
              <MaterialCommunityIcons
                name={isShowArchive ? 'toggle-switch' : 'toggle-switch-off-outline'}
                size={28}
                color={isShowArchive ? COLOR.BLUE : COLOR.GRAY4}
              />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {showOnlyFavorites && favoriteProjectIds.length === 0 && (
        <View style={{ padding: 20, alignItems: 'flex-start' }}>
          <Text style={{ color: COLOR.GRAY4, fontSize: 14 }}>{t('Projects.label.noFavorites')}</Text>
        </View>
      )}
      {/* Table */}
      <View style={{ flex: 1 }}>
        {isLoading ? (
          <Loading visible={isLoading} text="" />
        ) : (
          <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }} style={{ marginBottom: insets.bottom }}>
            <View style={{ flexDirection: 'column', flex: 1 }}>
              {renderTableHeader()}
              <FlatList
                style={Platform.OS === 'web' ? { maxHeight: tableHeight } : undefined}
                data={sortedProjects}
                extraData={sortedProjects}
                renderItem={renderItem}
              />
            </View>
          </ScrollView>
        )}
      </View>

      <ProjectsButtons createProject={pressAddProject} reloadProjects={onReloadProjects} />
      <Loading visible={migrationProgress !== ''} text={migrationProgress} />
      <ProjectsModalEncryptPassword
        visible={isEncryptPasswordModalOpen}
        pressOK={pressEncryptPasswordOK}
        pressCancel={pressEncryptPasswordCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLOR.MAIN,
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLOR.MAIN,
    paddingHorizontal: 10,
  },
  td: {
    alignItems: 'flex-start',
    backgroundColor: COLOR.MAIN,
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    //flex: 1,
    //flexDirection: 'row',
    height: 45,
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
