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

type SortField = 'name' | 'abstract' | 'storage' | 'license' | 'encryptedAt';
type SortOrder = 'ASCENDING' | 'DESCENDING' | 'UNSORTED';

export default function Projects() {
  const {
    projects,
    user,
    isLoading,
    isEncryptPasswordModalOpen,
    favoriteProjectIds,
    showOnlyFavorites,
    pressEncryptPasswordOK,
    pressEncryptPasswordCancel,
    onReloadProjects,
    pressAddProject,
    gotoProject,
    gotoBack,
    toggleFavorite,
    toggleShowOnlyFavorites,
  } = useContext(ProjectsContext);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // Web用: ヘッダー(56 + insets.top) + テーブルヘッダー(45) + ボタン(約60) + マージンを引く
  const tableHeight = windowHeight - (56 + insets.top) - 45 - 60 - insets.bottom - 20;

  const [sortField, setSortField] = useState<SortField>('name');
  const [sortOrder, setSortOrder] = useState<SortOrder>('ASCENDING');

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
    if (showOnlyFavorites) {
      return projects.filter((p) => favoriteProjectIds.includes(p.id));
    }
    return projects;
  }, [projects, showOnlyFavorites, favoriteProjectIds]);

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
        case 'license':
          aValue = a.license || '';
          bValue = b.license || '';
          break;
        case 'encryptedAt':
          aValue = a.settingsEncryptedAt ? new Date(a.settingsEncryptedAt).getTime() : 0;
          bValue = b.settingsEncryptedAt ? new Date(b.settingsEncryptedAt).getTime() : 0;
          break;
      }

      if (aValue < bValue) return sortOrder === 'ASCENDING' ? -1 : 1;
      if (aValue > bValue) return sortOrder === 'ASCENDING' ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [filteredProjects, sortField, sortOrder]);

  // テーブルヘッダー（カラム名）のレンダリング
  const renderTableHeader = () => (
    <View style={{ flexDirection: 'row', height: 45 }}>
      <Pressable style={[styles.th, { width: 40 }]} onPress={toggleShowOnlyFavorites}>
        <MaterialCommunityIcons
          name={showOnlyFavorites ? 'star' : 'star-outline'}
          size={20}
          color={showOnlyFavorites ? COLOR.YELLOW : COLOR.GRAY4}
        />
      </Pressable>
      <Pressable style={[styles.th, { flex: 3, width: 140 }]} onPress={() => handleSort('name')}>
        <Text>{`${t('common.projectName')}`}</Text>
        {sortField === 'name' && sortOrder === 'ASCENDING' && (
          <MaterialCommunityIcons name="sort-alphabetical-ascending" size={16} color="black" />
        )}
        {sortField === 'name' && sortOrder === 'DESCENDING' && (
          <MaterialCommunityIcons name="sort-alphabetical-descending" size={16} color="black" />
        )}
      </Pressable>
      <Pressable style={[styles.th, { flex: 2, width: 120 }]} onPress={() => handleSort('abstract')}>
        <Text>{`${t('common.overview')}`}</Text>
        {sortField === 'abstract' && sortOrder === 'ASCENDING' && (
          <MaterialCommunityIcons name="sort-alphabetical-ascending" size={16} color="black" />
        )}
        {sortField === 'abstract' && sortOrder === 'DESCENDING' && (
          <MaterialCommunityIcons name="sort-alphabetical-descending" size={16} color="black" />
        )}
      </Pressable>
      <Pressable style={[styles.th, { flex: 2, width: 120 }]} onPress={() => handleSort('encryptedAt')}>
        <Text>{`${t('common.updatedAt')}`}</Text>
        {sortField === 'encryptedAt' && sortOrder === 'ASCENDING' && (
          <MaterialCommunityIcons name="sort-calendar-ascending" size={16} color="black" />
        )}
        {sortField === 'encryptedAt' && sortOrder === 'DESCENDING' && (
          <MaterialCommunityIcons name="sort-calendar-descending" size={16} color="black" />
        )}
      </Pressable>
      <View style={[styles.th, { flex: 2, width: 100 }]}>
        <Text>{`${t('common.owner')}`}</Text>
      </View>
      <Pressable style={[styles.th, { flex: 2, width: 120 }]} onPress={() => handleSort('storage')}>
        <Text>{`${t('common.usage')}`}</Text>
        {sortField === 'storage' && sortOrder === 'ASCENDING' && (
          <MaterialCommunityIcons name="sort-numeric-ascending" size={16} color="black" />
        )}
        {sortField === 'storage' && sortOrder === 'DESCENDING' && (
          <MaterialCommunityIcons name="sort-numeric-descending" size={16} color="black" />
        )}
      </Pressable>
      <Pressable style={[styles.th, { flex: 2, width: 120 }]} onPress={() => handleSort('license')}>
        <Text>{`${t('common.license')}`}</Text>
        {sortField === 'license' && sortOrder === 'ASCENDING' && (
          <MaterialCommunityIcons name="sort-alphabetical-ascending" size={16} color="black" />
        )}
        {sortField === 'license' && sortOrder === 'DESCENDING' && (
          <MaterialCommunityIcons name="sort-alphabetical-descending" size={16} color="black" />
        )}
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Custom Header */}
      <View style={[styles.header, { height: 56 + insets.top, paddingTop: insets.top }]}>
        <TouchableOpacity style={{ padding: 5 }} onPress={gotoBack}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLOR.BLACK} />
        </TouchableOpacity>
        <Text style={{ fontSize: 16 }}>{t('Projects.navigation.title')}</Text>
        <View style={{ width: 40 }} />
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
                renderItem={({ item, index }) => (
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
                      >
                        {item.name}
                      </Text>
                    </View>
                    <View style={[styles.td, { flex: 2, width: 120 }]}>
                      <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                        {item.abstract}
                      </Text>
                    </View>
                    <View style={[styles.td, { flex: 2, width: 120, alignItems: 'center' }]}>
                      <Text adjustsFontSizeToFit={true} numberOfLines={2}>
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
                      <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                        {`${
                          item.storage !== undefined ? (item.storage.count / (1024 * 1024 * 1024)).toFixed(2) : 0
                        }GB`}
                      </Text>
                    </View>
                    <View style={[styles.td, { flex: 2, width: 120, alignItems: 'center' }]}>
                      <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                        {item.license ?? 'Free'}
                      </Text>
                    </View>
                  </Pressable>
                )}
              />
            </View>
          </ScrollView>
        )}
      </View>

      <ProjectsButtons createProject={pressAddProject} reloadProjects={onReloadProjects} />
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
