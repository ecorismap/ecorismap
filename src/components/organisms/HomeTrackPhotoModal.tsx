import React, { useContext, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Modal, Text } from 'react-native';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';
import ImageViewer from 'react-native-image-zoom-viewer';
import dayjs from '../../i18n/dayjs';
import { TrackPhotoContext } from '../../contexts/TrackPhoto';
import { TrackPhotoType } from '../../types';
import { Button } from '../atoms';
import { createPreviewImage } from '../../utils/Photo';

// 実ファイル（file://）を持たない写真（iOSのLive Photo・iCloud未ダウンロード等はph://）は
// RNのImageで表示できないため、拡大表示用の画像を書き出して差し替える。
// 生成中はサムネイルを引き伸ばして表示し、出来上がったら差し替わる（アスペクト比は同じなので
// ImageViewerが測った表示サイズはそのまま使える）
const needsPreviewFile = (photo: TrackPhotoType) => photo.localUri === undefined && !photo.uri.startsWith('file://');

// 同じ写真を開き直したときの再生成を避けるセッション内キャッシュ。
// 進行中のPromiseを入れておくことで、スワイプ中の二重生成も防ぐ
const previewCache = new Map<string, Promise<string | null>>();
const PREVIEW_CACHE_MAX_ENTRIES = 50;

const getPreviewUri = (photo: TrackPhotoType): Promise<string | null> => {
  const cached = previewCache.get(photo.assetId);
  if (cached !== undefined) return cached;
  if (previewCache.size >= PREVIEW_CACHE_MAX_ENTRIES) {
    const oldestKey = previewCache.keys().next().value;
    if (oldestKey !== undefined) previewCache.delete(oldestKey);
  }
  const promise = createPreviewImage(photo.uri).catch(() => null);
  previewCache.set(photo.assetId, promise);
  return promise;
};

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
  const [previewUris, setPreviewUris] = useState<{ [assetId: string]: string }>({});
  const isOpenRef = useRef(false);

  useEffect(() => {
    if (selectedPhoto === null) {
      isOpenRef.current = false;
      setViewerPhotos(null);
      setPreviewUris({});
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

  // 表示中の写真から順に拡大表示用の画像を用意する（生成済みはキャッシュから即返る）
  useEffect(() => {
    if (viewerPhotos === null) return;
    const targets = [viewerPhotos[currentIndex], ...viewerPhotos.filter((_, index) => index !== currentIndex)].filter(
      (photo): photo is TrackPhotoType => photo !== undefined && needsPreviewFile(photo)
    );
    if (targets.length === 0) return;
    let isCancelled = false;
    (async () => {
      for (const photo of targets) {
        const uri = await getPreviewUri(photo);
        if (isCancelled) return;
        if (uri !== null)
          setPreviewUris((prev) => (prev[photo.assetId] === uri ? prev : { ...prev, [photo.assetId]: uri }));
      }
    })();
    return () => {
      isCancelled = true;
    };
  }, [viewerPhotos, currentIndex]);

  if (selectedPhoto === null || viewerPhotos === null) return null;
  const currentPhoto = viewerPhotos[currentIndex] ?? selectedPhoto;
  const close = () => setSelectedPhoto(null);
  // 実ファイルがあるものは原画をそのまま表示する。
  // ph://しかないものは書き出した拡大表示用の画像を使い、生成中はサムネイルで代用する
  const imageUri = (photo: TrackPhotoType) => {
    if (!needsPreviewFile(photo)) return photo.localUri ?? photo.uri;
    return previewUris[photo.assetId] ?? photo.thumbnail ?? photo.uri;
  };

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
          // 原画のサイズを渡す。ImageViewerは渡されたサイズで表示レイアウトを決めるため、
          // 生成待ちでサムネイルを代用している間も小さく表示されない
          imageUrls={viewerPhotos.map((p) => ({ url: imageUri(p), width: p.width, height: p.height }))}
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
