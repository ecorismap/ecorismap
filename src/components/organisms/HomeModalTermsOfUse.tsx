import React, { useCallback, useEffect, useMemo } from 'react';
import { View, Modal, Text, StyleSheet, Linking, Platform } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR, CURRENT_TERMS_VERSION } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../store';
import { editSettingsAction } from '../../modules/settings';
import { AlertAsync } from '../molecules/AlertAsync';
import { db } from '../../utils/db';

export const HomeModalTermsOfUse = React.memo(() => {
  //console.log('render ModalTileMap');
  const dispatch = useDispatch();
  const agreedTermsVersion = useSelector((state: RootState) => state.settings.agreedTermsVersion);
  const isTermsOfUseOpen = useMemo(() => agreedTermsVersion !== CURRENT_TERMS_VERSION, [agreedTermsVersion]);

  const termsOfUseOK = useCallback(() => {
    dispatch(editSettingsAction({ agreedTermsVersion: CURRENT_TERMS_VERSION }));
  }, [dispatch]);

  const termsOfUseCancel = useCallback(() => {
    AlertAsync(t('Home.alert.termsOfuse'));
  }, []);

  const pressTermsOfUse = useCallback(() => {
    const url = t('site.termsOfUse');
    Linking.openURL(url);
  }, []);

  useEffect(() => {
    //ブラウザを開きなおしたときに、データを消去する
    if (isTermsOfUseOpen) {
      if (Platform.OS === 'web') {
        db.geotiff.clear();
        db.pmtiles.clear();
      }
    }
  }, [isTermsOfUseOpen]);

  const styles = StyleSheet.create({
    input: {
      backgroundColor: COLOR.WHITE,
      borderColor: COLOR.GRAY1,
      borderWidth: 1,
      fontSize: 16,
      height: 40,
      paddingHorizontal: 12,
      width: 280,
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginTop: 10,
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
    },
    modalHeaderButton: {
      position: 'absolute',
      right: -20,
      top: -10,
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
    modalTextInput: {
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      height: 40,
      marginBottom: 10,
      paddingHorizontal: 5,
      width: 280,
    },
    modalTitle: {
      fontSize: 20,
      marginBottom: 10,
      textAlign: 'center',
    },
    notice: {
      color: COLOR.GRAY4,
      fontSize: 16,
      marginBottom: 10,
      textAlign: 'center',
    },
    text: {
      color: COLOR.BLUE,
      fontSize: 20,
      textAlign: 'center',
      textDecorationLine: 'underline',
    },
    updateNotice: {
      color: COLOR.RED,
      fontSize: 16,
      marginBottom: 10,
      textAlign: 'center',
    },
  });

  return (
    <Modal animationType="none" transparent={true} visible={isTermsOfUseOpen}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <View style={{ flexDirection: 'column', marginBottom: 10 }}>
              {agreedTermsVersion !== '' && agreedTermsVersion !== CURRENT_TERMS_VERSION && (
                <Text style={styles.updateNotice}>{t('common.termsUpdated')}</Text>
              )}
              <Text style={styles.notice}>{t('tutrials.termsOfUse')}</Text>
              <View style={{ alignItems: 'center', margin: 10 }}>
                <Pressable onPress={pressTermsOfUse}>
                  <Text style={styles.text}>{`${t('common.termsOfUse')}`}</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.modalButtonContainer}>
              <Pressable style={styles.modalOKCancelButton} onPress={termsOfUseOK}>
                <Text>OK</Text>
              </Pressable>
              <Pressable
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={termsOfUseCancel}
              >
                <Text>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
