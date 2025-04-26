import React, { useContext } from 'react';
import { View, StyleSheet, Modal } from 'react-native';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';
import { DataEditContext } from '../../contexts/DataEdit';
import { t } from '../../i18n/config';
import ImageViewer from 'react-native-image-zoom-viewer';
import { useWindow } from '../../hooks/useWindow';
import { Button } from '../atoms';

export const DataEditModalPhotoView = () => {
  const { photo, isPhotoViewOpen, pressClosePhoto, pressRemovePhoto, pressDownloadPhoto } = useContext(DataEditContext);
  const { windowWidth } = useWindow();

  if (!isPhotoViewOpen) return null;

  return (
    <Modal visible={isPhotoViewOpen} transparent={true} animationType="fade">
      <View style={{ flex: 1, backgroundColor: COLOR.BLACK }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={styles.headerLeft}>
            <Button
              name={DATAEDIT_BTN.DELETE}
              labelText={t('DataEdit.label.delete')}
              onPress={pressRemovePhoto}
              backgroundColor={COLOR.DARKRED}
              size={20}
            />
          </View>

          <View style={styles.headerRight}>
            <Button name={DATAEDIT_BTN.CLOSE} onPress={pressClosePhoto} backgroundColor={COLOR.BLACK} size={30} />
          </View>
        </View>
        {photo.hasLocal && photo.uri ? (
          <ImageViewer imageUrls={[{ url: photo.uri }]} onCancel={pressClosePhoto} renderIndicator={() => <View />} />
        ) : (
          <View style={styles.modalCenteredView}>
            <View style={[styles.modalContents, { width: windowWidth * 1 }]}>
              <View style={[styles.modalButtonContainer, { width: windowWidth * 0.6 }]}>
                <View style={{ flex: 10 }}>
                  <View style={{ flex: 1, justifyContent: 'center' }}>
                    <Button name="download" onPress={pressDownloadPhoto} />
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  headerLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginLeft: 10,
  },
  headerRight: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
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
});
/* <TouchableOpacity style={[styles.button, { backgroundColor: COLOR.GRAY2 }]} onPress={pressDownloadPhoto}>
<Text style={{ color: COLOR.WHITE }}>{t('common.download')}</Text>
</TouchableOpacity> */
