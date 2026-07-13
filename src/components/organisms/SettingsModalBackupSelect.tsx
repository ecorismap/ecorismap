import React from 'react';
import { View, Modal, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView } from 'react-native-gesture-handler';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import dayjs from '../../i18n/dayjs';
import { BackupMetaType, BackupTriggerType } from '../../utils/projectBackup';

interface Props {
  visible: boolean;
  backupList: BackupMetaType[];
  pressSelect: (id: string) => void;
  pressCancel: () => void;
}

const triggerLabel = (trigger: BackupTriggerType) => {
  switch (trigger) {
    case 'projectClose':
      return t('Settings.backup.trigger.projectClose');
    case 'projectOpen':
      return t('Settings.backup.trigger.projectOpen');
    case 'fileNew':
      return t('Settings.backup.trigger.fileNew');
    case 'beforeRestore':
      return t('Settings.backup.trigger.beforeRestore');
    default:
      return '';
  }
};

export const SettingsModalBackupSelect = React.memo((props: Props) => {
  const { visible, backupList, pressSelect, pressCancel } = props;
  const { windowWidth, windowHeight } = useWindow();
  const modalWidthScale = 0.7;

  const styles = StyleSheet.create({
    modalCancelButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      height: 48,
      justifyContent: 'center',
      marginTop: 10,
      padding: 10,
      width: 80,
    },
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    modalContents: {
      alignItems: 'center',
      width: windowWidth * modalWidthScale,
    },
    modalFrameView: {
      alignItems: 'center',
      backgroundColor: COLOR.WHITE,
      borderRadius: 20,
      elevation: 5,
      margin: 0,
      paddingHorizontal: 35,
      paddingVertical: 25,
      shadowColor: COLOR.BLACK,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },
    modalList: {
      maxHeight: windowHeight * 0.5,
      width: windowWidth * modalWidthScale,
    },
    modalNoBackupText: {
      color: COLOR.GRAY4,
      fontSize: 16,
      marginBottom: 10,
    },
    modalOptionButton: {
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      flexDirection: 'row',
      justifyContent: 'flex-start',
      marginBottom: 10,
      padding: 10,
      width: windowWidth * modalWidthScale,
    },
    modalOptionSubText: {
      color: COLOR.GRAY4,
      fontSize: 12,
    },
    modalOptionText: {
      fontSize: 16,
    },
    modalTextContainer: {
      flex: 1,
      marginLeft: 10,
    },
    modalTitle: {
      fontSize: 20,
      marginBottom: 15,
      textAlign: 'center',
    },
  });

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{`${t('Settings.backup.title')}`}</Text>
            {backupList.length === 0 && (
              <Text style={styles.modalNoBackupText}>{`${t('Settings.backup.noBackups')}`}</Text>
            )}
            <ScrollView style={styles.modalList}>
              {backupList.map((meta) => (
                <Pressable key={meta.id} style={styles.modalOptionButton} onPress={() => pressSelect(meta.id)}>
                  <MaterialCommunityIcons name="backup-restore" size={24} color={COLOR.GRAY4} />
                  <View style={styles.modalTextContainer}>
                    <Text style={styles.modalOptionText}>
                      {meta.projectName ?? t('Settings.backup.localData')}
                    </Text>
                    <Text style={styles.modalOptionSubText}>
                      {`${dayjs(meta.createdAt).format('YYYY/MM/DD HH:mm')}  ${meta.recordCount}${t(
                        'Settings.backup.records'
                      )}  ${triggerLabel(meta.trigger)}`}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.modalCancelButton} onPress={pressCancel}>
              <Text>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
});
