import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Modal, Text } from 'react-native';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';
import ImageViewer from 'react-native-image-zoom-viewer';
import dayjs from '../../i18n/dayjs';
import { TrackPhotoContext } from '../../contexts/TrackPhoto';
import { TrackPhotoType } from '../../types';
import { Button } from '../atoms';

// 軌跡上の写真マーカーをタップしたときの拡大表示モーダル。
// 左右スワイプで軌跡上の他の写真（撮影時刻順）へ切り替えられる。
// 写真は端末ライブラリから都度読み出すため、削除・ダウンロード等の操作は持たない
export const HomeTrackPhotoModal = () => {
  const { trackPhotos, selectedPhoto, setSelectedPhoto } = useContext(TrackPhotoContext);

  // モーダルを開いた時点の照合結果をスナップショットして表示する。
  // 記録中のライブ更新でリストが差し替わっても、スワイプ位置や表示中の写真が飛ばないようにする
  const [viewerPhotos, setViewerPhotos] = useState<TrackPhotoType[] | null>(null);
  const [initialIndex, setInitialIndex] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isOpenRef = useRef(false);

  useEffect(() => {
    if (selectedPhoto === null) {
      isOpenRef.current = false;
      setViewerPhotos(null);
      return;
    }
    // 表示中のtrackPhotos更新では再スナップショットしない（selectedPhotoは開閉時のみ変わる）
    if (isOpenRef.current) return;
    isOpenRef.current = true;
    const index = trackPhotos.findIndex((p) => p.assetId === selectedPhoto.assetId);
    setViewerPhotos(index === -1 ? [selectedPhoto] : trackPhotos);
    setInitialIndex(index === -1 ? 0 : index);
    setCurrentIndex(index === -1 ? 0 : index);
  }, [selectedPhoto, trackPhotos]);

  if (selectedPhoto === null || viewerPhotos === null) return null;
  const currentPhoto = viewerPhotos[currentIndex] ?? selectedPhoto;
  const close = () => setSelectedPhoto(null);

  return (
    <Modal visible={true} transparent={true} animationType="fade">
      <View style={{ flex: 1, backgroundColor: COLOR.BLACK }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={styles.headerCenter}>
            <Text style={styles.timestamp}>{dayjs(currentPhoto.timestamp).format('L HH:mm:ss')}</Text>
            {viewerPhotos.length > 1 && (
              <Text style={styles.counter}>{`${currentIndex + 1} / ${viewerPhotos.length}`}</Text>
            )}
          </View>
          <View style={styles.headerRight}>
            <Button name={DATAEDIT_BTN.CLOSE} onPress={close} backgroundColor={COLOR.BLACK} size={30} />
          </View>
        </View>
        {/* @ts-ignore - react-native-image-zoom-viewer is not compatible with React 19 types */}
        <ImageViewer
          imageUrls={viewerPhotos.map((p) => ({ url: p.localUri ?? p.uri }))}
          index={initialIndex}
          onChange={(index) => setCurrentIndex(index ?? 0)}
          onCancel={close}
          renderIndicator={() => <View />}
        />
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  counter: {
    alignSelf: 'center',
    color: COLOR.GRAY2,
    fontSize: 14,
    marginLeft: 12,
  },
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
