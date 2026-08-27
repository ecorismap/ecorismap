import React, { useContext } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { CheckBox } from '../molecules/CheckBox';
import { TileManagementContext } from '../../contexts/TileManagement';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { DEM_VIEWSHED_MAP_ID } from '../../constants/DemSources';
import { t } from '../../i18n/config';

interface Props {
  onConfirm: () => void;
  onCancel: () => void;
}

export const HomeTileMapSelector = React.memo((props: Props) => {
  const { onConfirm, onCancel } = props;
  const {
    tileMaps,
    selectedTileMapIds,
    selectedDisplayTileMapId,
    toggleTileMapSelection,
    setSelectedDisplayTileMapId,
  } = useContext(TileManagementContext);

  const downloadableTileMaps = tileMaps.filter(
    (tileMap) =>
      tileMap.id !== 'standard' &&
      tileMap.id !== 'hybrid' &&
      !tileMap.url.endsWith('.pdf') &&
      !tileMap.url.startsWith('pdf://') &&
      !tileMap.url.includes('file://') &&
      !tileMap.url.includes('blob:')
  );

  // 「すべての地図」が選択されているか（selectedTileMapIdsが空 = すべて選択状態）
  const isAllMapsSelected = selectedTileMapIds.length === 0;

  const handleSelectAll = () => {
    // すべての選択を解除して「すべての地図」状態にする
    selectedTileMapIds.forEach((id) => {
      toggleTileMapSelection(id);
    });
    setSelectedDisplayTileMapId(null);
  };

  const handleMapSelect = (tileMapId: string) => {
    // 個別地図を選択したら、「すべての地図」を解除（何か選択する）
    if (isAllMapsSelected) {
      // 初めて個別選択する場合
      toggleTileMapSelection(tileMapId);
      // 可視領域用DEM（疑似地図）は表示地図にはなれない
      setSelectedDisplayTileMapId(tileMapId === DEM_VIEWSHED_MAP_ID ? null : tileMapId);
    } else {
      // すでに個別選択がある場合
      toggleTileMapSelection(tileMapId);

      // 選択を解除して空になったら「すべての地図」状態に
      const newSelectedIds = selectedTileMapIds.includes(tileMapId)
        ? selectedTileMapIds.filter((id) => id !== tileMapId)
        : [...selectedTileMapIds, tileMapId];
      // 表示地図の候補から疑似地図を除く
      const displayCandidateIds = newSelectedIds.filter((id) => id !== DEM_VIEWSHED_MAP_ID);

      if (displayCandidateIds.length === 0) {
        setSelectedDisplayTileMapId(null);
      } else if (displayCandidateIds.length === 1) {
        setSelectedDisplayTileMapId(displayCandidateIds[0]);
      } else if (selectedDisplayTileMapId && !displayCandidateIds.includes(selectedDisplayTileMapId)) {
        setSelectedDisplayTileMapId(displayCandidateIds[0]);
      }
    }
  };

  const isMapSelected = (tileMapId: string) => {
    return selectedTileMapIds.includes(tileMapId);
  };

  return (
    <View style={styles.overlay}>
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>{t('Home.download.selectMaps')}</Text>
        </View>
        <ScrollView style={styles.scrollView}>
          <CheckBox
            key="all"
            label={t('Home.download.allMaps')}
            checked={isAllMapsSelected}
            onCheck={handleSelectAll}
            labelAlign="row"
            labelSize={16}
            width={280}
            numberOfLines={2}
          />
          {downloadableTileMaps.map((tileMap) => (
            <CheckBox
              key={tileMap.id}
              label={tileMap.name}
              checked={isMapSelected(tileMap.id)}
              onCheck={() => handleMapSelect(tileMap.id)}
              labelAlign="row"
              labelSize={16}
              width={280}
              numberOfLines={2}
            />
          ))}
          {/* 可視領域用DEM。地図一覧には出さない内部専用のダウンロードターゲット */}
          <CheckBox
            key={DEM_VIEWSHED_MAP_ID}
            label={t('Home.download.demViewshed')}
            checked={isMapSelected(DEM_VIEWSHED_MAP_ID)}
            onCheck={() => handleMapSelect(DEM_VIEWSHED_MAP_ID)}
            labelAlign="row"
            labelSize={16}
            width={280}
            numberOfLines={2}
          />
        </ScrollView>
        <View style={styles.buttonContainer}>
          <Pressable style={styles.modalOKCancelButton} onPress={onCancel}>
            <Text>Cancel</Text>
          </Pressable>
          <Pressable style={[styles.modalOKCancelButton, { backgroundColor: COLOR.BLUE }]} onPress={onConfirm}>
            <Text style={{ color: COLOR.WHITE }}>OK</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLOR.SAVING_OVERLAY,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    backgroundColor: COLOR.MAIN,
    borderRadius: 10,
    padding: 15,
    margin: 10,
    maxHeight: 350,
    width: '90%',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  selectAllButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: COLOR.GRAY1,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLOR.GRAY3,
  },
  selectAllText: {
    fontSize: 12,
    color: COLOR.BLACK,
  },
  scrollView: {
    maxHeight: 250,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 15,
    gap: 10,
  },
  modalOKCancelButton: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderRadius: 5,
    elevation: 2,
    height: 48,
    justifyContent: 'center',
    padding: 10,
    width: 80,
  },
});
