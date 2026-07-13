import React, { useContext } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FlatList } from 'react-native-gesture-handler';
import { COLOR, GOOGLEDRIVE_BTN } from '../../constants/AppConstants';
import { GoogleDriveProjectsContext } from '../../contexts/GoogleDriveProjects';
import { t } from '../../i18n/config';
import { TextButton } from '../molecules/TextButton';
import { Button } from '../atoms';
import { Loading } from '../molecules/Loading';
import { BottomSheetHeader } from '../molecules/BottomSheetHeader';
import { GoogleDriveModalSaveName } from '../organisms/GoogleDriveModalSaveName';
import dayjs from '../../i18n/dayjs';

function formatSize(size: number) {
  if (size <= 0) return '';
  return size >= 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(size / 1024))}KB`;
}

export default function GoogleDriveProjects() {
  const {
    mode,
    isLoading,
    progress,
    isConnected,
    connectedEmail,
    driveProjects,
    isSaveModalOpen,
    defaultSaveName,
    pressConnect,
    pressDisconnect,
    pressReload,
    pressSaveToDrive,
    pressSaveOK,
    pressSaveCancel,
    pressLoadProject,
    pressDeleteProject,
    gotoBack,
  } = useContext(GoogleDriveProjectsContext);

  const styles = StyleSheet.create({
    accountRow: {
      alignItems: 'center',
      borderBottomColor: COLOR.GRAY1,
      borderBottomWidth: 1,
      flexDirection: 'row',
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    description: {
      color: COLOR.BLACK,
      fontSize: 14,
      padding: 15,
    },
    email: {
      flex: 1,
      fontSize: 14,
      marginLeft: 5,
    },
    itemInfo: {
      color: COLOR.GRAY4,
      fontSize: 12,
    },
    itemName: {
      fontSize: 16,
    },
    itemRow: {
      alignItems: 'center',
      borderBottomColor: COLOR.GRAY1,
      borderBottomWidth: 1,
      flexDirection: 'row',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    listNote: {
      color: COLOR.GRAY4,
      fontSize: 12,
      paddingHorizontal: 15,
      paddingVertical: 8,
    },
  });

  const loadingText = progress !== undefined ? `${Math.round(progress * 100)}%` : '';
  const title =
    mode === 'save'
      ? t('GoogleDriveProjects.navigation.saveTitle')
      : mode === 'open'
      ? t('GoogleDriveProjects.navigation.loadTitle')
      : t('GoogleDriveProjects.navigation.title');

  return (
    <View style={{ flex: 1 }}>
      <BottomSheetHeader title={title} showBackButton onBack={gotoBack} />
      <Loading visible={isLoading} text={loadingText} />
      {!isConnected ? (
        <View>
          <Text style={styles.description}>{t('GoogleDriveProjects.description')}</Text>
          <TextButton
            name={GOOGLEDRIVE_BTN.CONNECT}
            text={t('GoogleDriveProjects.connect.text')}
            onPress={pressConnect}
          />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.accountRow}>
            <Text style={styles.email} numberOfLines={1}>
              {`${t('GoogleDriveProjects.label.connectedTo')}${connectedEmail ?? ''}`}
            </Text>
            <View style={{ width: 33, marginRight: 15 }}>
              <Button
                name={GOOGLEDRIVE_BTN.RELOAD}
                borderRadius={5}
                backgroundColor={COLOR.GRAY3}
                onPress={pressReload}
              />
            </View>
            <View style={{ width: 33 }}>
              <Button
                name={GOOGLEDRIVE_BTN.DISCONNECT}
                borderRadius={5}
                backgroundColor={COLOR.GRAY3}
                onPress={pressDisconnect}
              />
            </View>
          </View>
          {mode !== 'open' && (
            <TextButton
              name={GOOGLEDRIVE_BTN.SAVE}
              text={t('GoogleDriveProjects.save.text')}
              onPress={pressSaveToDrive}
            />
          )}
          <Text style={styles.listNote}>{t('GoogleDriveProjects.listNote')}</Text>
          <FlatList
            data={driveProjects}
            keyExtractor={(item) => item.fileId}
            renderItem={({ item }) => (
              <View style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={styles.itemInfo}>
                    {`${item.updatedAt !== '' ? dayjs(item.updatedAt).format('YYYY/MM/DD HH:mm') : ''}  ${formatSize(
                      item.size
                    )}`}
                  </Text>
                </View>
                {mode !== 'save' && (
                  <View style={{ width: 33, marginRight: 15 }}>
                    <Button
                      name={GOOGLEDRIVE_BTN.LOAD}
                      borderRadius={5}
                      backgroundColor={COLOR.GRAY3}
                      onPress={() => pressLoadProject(item)}
                    />
                  </View>
                )}
                {/* 削除は管理画面（アカウントメニューから開いたモードなし表示）のみ。保存/読み込みの文脈では誤操作防止のため非表示 */}
                {mode === undefined && (
                  <View style={{ width: 33 }}>
                    <Button
                      name={GOOGLEDRIVE_BTN.DELETE}
                      borderRadius={5}
                      backgroundColor={COLOR.DARKRED}
                      onPress={() => pressDeleteProject(item)}
                    />
                  </View>
                )}
              </View>
            )}
          />
        </View>
      )}
      <GoogleDriveModalSaveName
        visible={isSaveModalOpen}
        defaultName={defaultSaveName}
        pressOK={pressSaveOK}
        pressCancel={pressSaveCancel}
      />
    </View>
  );
}
