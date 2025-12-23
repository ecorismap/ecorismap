import React, { useContext, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR, PROJECTEDIT_BTN } from '../../constants/AppConstants';
import { CloudDataManagementContext } from '../../contexts/CloudDataManagement';
import { CloudDataList } from '../organisms/CloudDataList';
import { Loading } from '../molecules/Loading';
import { Button } from '../atoms';
import { t } from '../../i18n/config';

// 各要素の高さ定数
const HEADER_HEIGHT = 56;
const SELECT_ALL_HEIGHT = 48;
const FOOTER_HEIGHT = 80;

export default function CloudDataManagementScreen() {
  const {
    isLoading,
    layerGroups,
    checkStates,
    isChecked,
    changeLayerChecked,
    changeDataChecked,
    changeCheckedAll,
    pressDeleteSelected,
    gotoBack,
  } = useContext(CloudDataManagementContext);
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  // Web用: リストの最大高さを計算
  const listMaxHeight = windowHeight - (HEADER_HEIGHT + insets.top) - SELECT_ALL_HEIGHT - FOOTER_HEIGHT - insets.bottom;

  const isAllChecked = useMemo(() => {
    return checkStates.length > 0 && checkStates.every((state) => state.checked);
  }, [checkStates]);

  return (
    <View style={styles.container}>
      {/* Fixed Header */}
      <View style={[styles.header, { height: HEADER_HEIGHT + insets.top, paddingTop: insets.top }]}>
        <TouchableOpacity style={styles.backButton} onPress={gotoBack}>
          <MaterialCommunityIcons name="chevron-left" size={28} color={COLOR.BLACK} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('CloudDataManagement.navigation.title')}</Text>
        <View style={styles.headerRight} />
      </View>

      {/* Select All Checkbox - Fixed */}
      <TouchableOpacity style={styles.selectAllContainer} onPress={() => changeCheckedAll(!isAllChecked)}>
        <MaterialCommunityIcons
          name={isAllChecked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
          size={24}
          color={COLOR.BLUE}
        />
        <Text style={styles.selectAllText}>{t('CloudDataManagement.label.selectAll')}</Text>
      </TouchableOpacity>

      {/* Scrollable Data List */}
      <View style={styles.listContainer}>
        <CloudDataList
          layerGroups={layerGroups}
          checkStates={checkStates}
          onChangeLayerChecked={changeLayerChecked}
          onChangeDataChecked={changeDataChecked}
          maxHeight={Platform.OS === 'web' ? listMaxHeight : undefined}
        />
      </View>

      {/* Fixed Footer - Delete Button */}
      <View style={[styles.footer, { paddingBottom: 15 + insets.bottom }]}>
        <View style={styles.buttonWrapper}>
          <Button
            name={PROJECTEDIT_BTN.DELETE}
            onPress={pressDeleteSelected}
            backgroundColor={isChecked ? COLOR.DARKRED : COLOR.LIGHTBLUE}
            disabled={!isChecked}
            labelText={t('CloudDataManagement.label.delete')}
          />
        </View>
      </View>

      <Loading visible={isLoading} text="" />
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
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 16,
  },
  headerRight: {
    width: 40,
  },
  selectAllContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLOR.GRAY2,
  },
  selectAllText: {
    fontSize: 14,
    color: COLOR.BLACK,
    marginLeft: 12,
  },
  listContainer: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 15,
    backgroundColor: COLOR.MAIN,
  },
  buttonWrapper: {
    marginHorizontal: 10,
  },
});
