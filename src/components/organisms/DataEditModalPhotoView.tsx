import React, { useContext, useMemo } from 'react';
import { View, Text, StyleSheet, Image, Modal, TouchableOpacity } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { DataEditContext } from '../../contexts/DataEdit';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import { Button } from '../atoms';

export const DataEditModalPhotoView = () => {
  const { photo, isPhotoViewOpen, pressClosePhoto, pressRemovePhoto, pressDownloadPhoto } = useContext(DataEditContext);

  const { windowWidth } = useWindow();
  // const { visible, photo, pressClose, pressRemove, pressDownloadPhoto } = props;

  const photoSize = useMemo(() => {
    return {
      width: photo.width > photo.height ? windowWidth * 1 : windowWidth * 1 * 0.75,
      height: photo.width < photo.height ? windowWidth * 1 : windowWidth * 1 * 0.75,
    };
  }, [photo.height, photo.width, windowWidth]);

  //console.log(photo);
  return (
    <Modal animationType="none" transparent={false} visible={isPhotoViewOpen}>
      <View style={styles.modalCenteredView}>
        <View style={[styles.modalContents, { width: windowWidth * 1 }]}>
          {photo.hasLocal && photo.uri ? (
            <View style={{ flex: 10 }}>
              <Image
                source={{
                  uri: photo.uri,
                }}
                style={{
                  width: photoSize.width,
                  height: photoSize.height,
                  resizeMode: 'contain',
                  flex: 1,
                }}
              />
            </View>
          ) : (
            <View style={{ flex: 10 }}>
              <View style={{ flex: 1, justifyContent: 'center' }}>
                <Button name="download" onPress={pressDownloadPhoto} />
              </View>
            </View>
          )}
          <View style={[styles.modalButtonContainer, { width: windowWidth * 0.6 }]}>
            <TouchableOpacity style={styles.modalOKCancelButton} onPress={pressClosePhoto}>
              <Text>{t('common.close')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modalOKCancelButton, { backgroundColor: COLOR.DARKRED }]}
              onPress={pressRemovePhoto}
            >
              <Text style={{ color: COLOR.WHITE }}>{t('common.delete')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {/* </View> */}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalButtonContainer: {
    //backgroundColor: COLOR.WHITE,
    flexDirection: 'row',
    flex: 1,
    justifyContent: 'space-evenly',
    marginTop: 30,
  },
  modalCenteredView: {
    alignItems: 'center',
    backgroundColor: COLOR.BLACK,
    flex: 1,
    justifyContent: 'center',
  },
  modalContents: {
    alignItems: 'center',
    flex: 1,
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
