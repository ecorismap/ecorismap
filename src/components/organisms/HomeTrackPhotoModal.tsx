import React, { useContext } from 'react';
import { View, StyleSheet, Modal, Text } from 'react-native';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';
import ImageViewer from 'react-native-image-zoom-viewer';
import dayjs from '../../i18n/dayjs';
import { TrackPhotoContext } from '../../contexts/TrackPhoto';
import { Button } from '../atoms';

// 軌跡上の写真マーカーをタップしたときの拡大表示モーダル。
// 写真は端末ライブラリから都度読み出すため、削除・ダウンロード等の操作は持たない
export const HomeTrackPhotoModal = () => {
  const { selectedPhoto, setSelectedPhoto } = useContext(TrackPhotoContext);

  if (selectedPhoto === null) return null;
  const url = selectedPhoto.localUri ?? selectedPhoto.uri;
  const close = () => setSelectedPhoto(null);

  return (
    <Modal visible={true} transparent={true} animationType="fade">
      <View style={{ flex: 1, backgroundColor: COLOR.BLACK }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={styles.headerCenter}>
            <Text style={styles.timestamp}>{dayjs(selectedPhoto.timestamp).format('L HH:mm:ss')}</Text>
          </View>
          <View style={styles.headerRight}>
            <Button name={DATAEDIT_BTN.CLOSE} onPress={close} backgroundColor={COLOR.BLACK} size={30} />
          </View>
        </View>
        {/* @ts-ignore - react-native-image-zoom-viewer is not compatible with React 19 types */}
        <ImageViewer imageUrls={[{ url }]} onCancel={close} renderIndicator={() => <View />} />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  headerCenter: {
    alignItems: 'flex-start',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    margin: 10,
  },
  headerRight: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    margin: 10,
  },
  timestamp: {
    alignSelf: 'center',
    color: COLOR.WHITE,
    fontSize: 14,
  },
});
