import React, { useContext, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, Modal, Text } from 'react-native';
import { COLOR, DATAEDIT_BTN } from '../../constants/AppConstants';
import { DataEditContext } from '../../contexts/DataEdit';
import { t } from '../../i18n/config';
import ImageViewer from 'react-native-image-zoom-viewer';
import { Button } from '../atoms';
import { useModalYieldingToDialog } from '../molecules/StyledDialog';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isPhotoField } from '../../utils/Geometry';
import { hasLocalPhotoFile } from '../../utils/Photo';
import { PhotoType } from '../../types';

// 同じ写真フィールドにある写真を左右スワイプで切り替えて表示するモーダル。
// 削除・ダウンロードは表示中の写真（DataEditContextのphoto）に対して行う
export const DataEditModalPhotoView = () => {
  const { data, photo, isPhotoViewOpen, pressClosePhoto, pressRemovePhoto, pressDownloadPhoto, swipePhoto } =
    useContext(DataEditContext);
  // Modalは画面最上端から描かれるため、ノッチ・ステータスバーの下にボタンが隠れないよう余白を入れる
  const insets = useSafeAreaInsets();
  //削除・ダウンロードの確認ダイアログが出ている間は引っ込める（iOSのModal二枚制約）
  const shown = useModalYieldingToDialog(isPhotoViewOpen);

  // 同じフィールドの写真のうち表示できるもの（uri===undefinedは削除済み）。
  // サムネイル一覧と同じ並びにし、元の配列位置をindexとして持つ
  const photos = useMemo(() => {
    const fieldData = data.field[photo.fieldName];
    if (!isPhotoField(fieldData)) return [];
    return fieldData.map((p, index) => ({ photo: p, index })).filter(({ photo: p }) => p.uri !== undefined);
  }, [data.field, photo.fieldName]);

  // 開いた時点の写真の位置。ImageViewerはindexが変わると飛ぶので、スワイプ中は更新しない
  const [initialIndex, setInitialIndex] = useState(0);
  // 各写真の実ファイルの有無。無いものはサムネイルで代用し、ダウンロードボタンを出す。
  // nullは確認中。ImageViewerは最初に描いた画像の寸法で表示サイズを固定するため、
  // サムネイルで描き始めてから原画に差し替えるとぼやけたままになる。確認が終わるまで描かない
  const [hasLocalMap, setHasLocalMap] = useState<{ [photoId: string]: boolean } | null>(null);

  useEffect(() => {
    if (!isPhotoViewOpen) {
      setHasLocalMap(null);
      return;
    }
    const current = photos.findIndex(({ index }) => index === photo.index);
    setInitialIndex(current === -1 ? 0 : current);
    let cancelled = false;
    Promise.all(photos.map(({ photo: p }) => hasLocalPhotoFile(p.uri))).then((results) => {
      if (cancelled) return;
      const map: { [photoId: string]: boolean } = {};
      photos.forEach(({ photo: p }, i) => (map[p.id] = results[i]));
      setHasLocalMap(map);
    });
    return () => {
      cancelled = true;
    };
    // 開いたときだけ評価する（photoはスワイプで変わるが、位置を取り直すと表示が飛ぶ）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPhotoViewOpen]);

  const imageUrls = useMemo(
    () =>
      hasLocalMap === null
        ? []
        : photos.map(({ photo: p }) => ({
            // 原画のサイズを渡す。サムネイル代用のときも小さく表示されない
            url: displayUri(p, hasLocalMap[p.id]),
            width: p.width,
            height: p.height,
          })),
    [photos, hasLocalMap]
  );

  if (!isPhotoViewOpen) return null;

  const currentPosition = photos.findIndex(({ index }) => index === photo.index);
  const hasLocal = photo.hasLocal;

  return (
    <Modal visible={shown} transparent={true} animationType="fade">
      <View style={{ flex: 1, backgroundColor: COLOR.BLACK }}>
        <View style={{ flexDirection: 'row', paddingTop: insets.top }}>
          <View style={styles.headerLeft}>
            <Button
              name={DATAEDIT_BTN.DELETE}
              labelText={t('DataEdit.label.delete')}
              onPress={pressRemovePhoto}
              backgroundColor={COLOR.DARKRED}
              size={20}
            />
          </View>
          {photos.length > 1 && currentPosition !== -1 && (
            <View style={styles.headerCenter}>
              <Text style={styles.counter}>{`${currentPosition + 1} / ${photos.length}`}</Text>
            </View>
          )}
          <View style={styles.headerRight}>
            <Button name={DATAEDIT_BTN.CLOSE} onPress={pressClosePhoto} backgroundColor={COLOR.BLACK} size={30} />
          </View>
        </View>
        {imageUrls.length > 0 && (
          // @ts-ignore - react-native-image-zoom-viewer is not compatible with React 19 types
          <ImageViewer
            imageUrls={imageUrls}
            index={initialIndex}
            onChange={(position) => {
              const next = photos[position ?? 0];
              if (next !== undefined && next.index !== photo.index) swipePhoto(photo.fieldName, next.photo, next.index);
            }}
            onCancel={pressClosePhoto}
            renderIndicator={() => <View />}
          />
        )}
        {!hasLocal && (
          <View style={[styles.downloadContainer, { bottom: insets.bottom + 30 }]}>
            <Button name="download" onPress={pressDownloadPhoto} />
          </View>
        )}
      </View>
    </Modal>
  );
};

// 実ファイルがあればそれを、無ければサムネイルを表示する（未ダウンロードやファイル消失時）
const displayUri = (p: PhotoType, hasLocal: boolean | undefined) => {
  if (hasLocal && p.uri) return p.uri;
  return p.thumbnail ?? '';
};

const styles = StyleSheet.create({
  counter: {
    color: COLOR.WHITE,
    fontSize: 14,
  },
  downloadContainer: {
    alignItems: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
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
});
