import React, { useCallback, useMemo } from 'react';
import { View, Modal, Text, StyleSheet, ScrollView } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR, VERSION } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { editSettingsAction } from '../../modules/settings';

export const HomeModalUpdateInfo = React.memo(() => {
  const dispatch = useDispatch();
  const lastSeenVersion = useSelector((state: RootState) => state.settings.lastSeenVersion);
  const isUpdateInfoOpen = useMemo(() => lastSeenVersion !== VERSION && lastSeenVersion !== '', [lastSeenVersion]);

  const updateInfoOK = useCallback(() => {
    dispatch(editSettingsAction({ lastSeenVersion: VERSION }));
  }, [dispatch]);

  const styles = StyleSheet.create({
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      marginTop: 20,
      width: 280,
    },
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    modalContents: {
      alignItems: 'center',
      width: 280,
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
      maxHeight: '80%',
    },
    modalOKButton: {
      alignItems: 'center',
      backgroundColor: COLOR.BLUE,
      borderRadius: 5,
      elevation: 2,
      height: 48,
      justifyContent: 'center',
      padding: 10,
      width: 120,
    },
    modalOKButtonText: {
      color: COLOR.WHITE,
      fontSize: 16,
      fontWeight: 'bold',
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      marginBottom: 10,
      textAlign: 'center',
    },
    updateInfoContainer: {
      backgroundColor: COLOR.GRAY0,
      borderRadius: 10,
      maxHeight: 300,
      padding: 15,
      width: 280,
    },
    updateInfoSection: {
      marginBottom: 15,
    },
    updateInfoSectionTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      marginBottom: 5,
      color: COLOR.DARKBLUE,
    },
    updateInfoItem: {
      fontSize: 14,
      lineHeight: 20,
      marginLeft: 10,
      marginBottom: 3,
      color: COLOR.GRAY4,
    },
    versionText: {
      fontSize: 16,
      color: COLOR.GRAY3,
      textAlign: 'center',
      marginBottom: 15,
    },
  });

  return (
    <Modal animationType="fade" transparent={true} visible={isUpdateInfoOpen}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{t('Home.updateInfo.title')}</Text>
            <Text style={styles.versionText}>{VERSION}</Text>

            <ScrollView style={styles.updateInfoContainer} showsVerticalScrollIndicator={true}>
              <View style={styles.updateInfoSection}>
                <Text style={styles.updateInfoSectionTitle}>{t('Home.updateInfo.newFeatures')}</Text>
                {t('Home.updateInfo.feature1') && (
                  <Text style={styles.updateInfoItem}>• {t('Home.updateInfo.feature1')}</Text>
                )}
                {t('Home.updateInfo.feature2') && (
                  <Text style={styles.updateInfoItem}>• {t('Home.updateInfo.feature2')}</Text>
                )}
                {t('Home.updateInfo.feature3') && (
                  <Text style={styles.updateInfoItem}>• {t('Home.updateInfo.feature3')}</Text>
                )}
              </View>

              {/* <View style={styles.updateInfoSection}>
                <Text style={styles.updateInfoSectionTitle}>{t('Home.updateInfo.improvements')}</Text>
                <Text style={styles.updateInfoItem}>• {t('Home.updateInfo.improvement1')}</Text>
                <Text style={styles.updateInfoItem}>• {t('Home.updateInfo.improvement2')}</Text>
              </View>

              <View style={styles.updateInfoSection}>
                <Text style={styles.updateInfoSectionTitle}>{t('Home.updateInfo.bugFixes')}</Text>
                <Text style={styles.updateInfoItem}>• {t('Home.updateInfo.bugFix1')}</Text>
                <Text style={styles.updateInfoItem}>• {t('Home.updateInfo.bugFix2')}</Text>
              </View> */}
            </ScrollView>

            <View style={styles.modalButtonContainer}>
              <Pressable style={styles.modalOKButton} onPress={updateInfoOK}>
                <Text style={styles.modalOKButtonText}>{t('common.ok')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
