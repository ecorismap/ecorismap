/**
 * 眺望モードの表示中インジケータ兼解除UI。
 *
 * 眺望中は地図のドラッグが「その場で見回す」に変わり、移動しなくなる。
 * 通常の操作と挙動が違うことを示し、押せば戻れる出口をここに置く
 * （可視領域・測定のバナーと同じ並びに積む）。
 */
import React, { useCallback, useContext, useSyncExternalStore } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { MapViewContext } from '../../contexts/MapView';
import { isTerrain3DHandle } from '../../utils/terrain3d/types';
import { terrain3dVistaStore } from '../../utils/terrain3d/vistaStore';
import { t } from '../../i18n/config';
import { useHomeTopLayout } from '../../hooks/useHomeTopLayout';

export const HomeTerrain3DVistaBanner = React.memo(() => {
  const { mapViewRef } = useContext(MapViewContext);
  const vista = useSyncExternalStore(terrain3dVistaStore.subscribe, terrain3dVistaStore.getSnapshot);
  const { vistaBannerTop } = useHomeTopLayout();

  const pressClear = useCallback(() => {
    const handle = mapViewRef.current;
    if (isTerrain3DHandle(handle)) handle.clearVista();
  }, [mapViewRef]);

  if (!vista.active) return null;

  return (
    <View style={[styles.container, { top: vistaBannerTop }]} pointerEvents="box-none">
      <Pressable onPress={pressClear} style={styles.banner}>
        <MaterialCommunityIcons name="binoculars" size={18} color={COLOR.WHITE} />
        <Text style={styles.text}>{t('Home.vista.banner')}</Text>
        <MaterialCommunityIcons name="close" size={18} color={COLOR.WHITE} style={styles.close} />
      </Pressable>
    </View>
  );
});

const styles = StyleSheet.create({
  banner: {
    alignItems: 'center',
    backgroundColor: COLOR.BANNER_BACKGROUND,
    borderRadius: 20,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  close: {
    marginLeft: 10,
  },
  container: {
    alignItems: 'center',
    elevation: 1001,
    left: 0,
    position: 'absolute',
    right: 0,
    zIndex: 1001,
  },
  text: {
    color: COLOR.WHITE,
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
});
