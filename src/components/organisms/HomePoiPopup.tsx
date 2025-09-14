import React, { useContext, useCallback, useMemo } from 'react';
import { View, Text, Linking, Platform } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { MapViewContext } from '../../contexts/MapView';
import { COLOR } from '../../constants/AppConstants';
import { latLonToXY } from '../../utils/Coords';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';

export const HomePoiPopup = React.memo(() => {
  const { poiInfo, setPoiInfo, mapViewRef } = useContext(MapViewContext);
  const { mapRegion, mapSize } = useWindow();
  const WIDTH = 150;
  const HEIGHT = 40;
  
  const openGoogleMaps = useCallback(() => {
    if (!poiInfo) return;
    
    const { latitude, longitude } = poiInfo.coordinate;
    const encodedName = encodeURIComponent(poiInfo.name);
    
    let url: string;
    if (Platform.OS === 'ios') {
      // iOS用のGoogle Maps URLスキーム
      if (poiInfo.placeId && poiInfo.placeId.length > 0) {
        // Place IDがある場合は詳細ページへ
        url = `comgooglemaps://?q=${encodedName}&center=${latitude},${longitude}`;
      } else {
        // Place IDがない場合は座標で検索
        url = `comgooglemaps://?q=${latitude},${longitude}`;
      }
      
      // Google Mapsアプリがインストールされていない場合のフォールバック
      Linking.canOpenURL(url).then(supported => {
        if (!supported) {
          if (poiInfo.placeId && poiInfo.placeId.length > 0) {
            // Place IDを使用した詳細ページURL
            url = `https://www.google.com/maps/search/?api=1&query=${encodedName}&query_place_id=${poiInfo.placeId}`;
          } else {
            // 座標ベースの検索
            url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
          }
        }
        Linking.openURL(url);
      });
    } else if (Platform.OS === 'android') {
      // Android用
      if (poiInfo.placeId && poiInfo.placeId.length > 0) {
        // Place IDと名前を使った検索で詳細画面を表示
        url = `https://www.google.com/maps/search/?api=1&query=${encodedName}&query_place_id=${poiInfo.placeId}`;
      } else {
        // 座標ベースの検索
        url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      }
      Linking.openURL(url).catch(() => {
        // エラーハンドリング
      });
    } else {
      // Web用
      if (poiInfo.placeId && poiInfo.placeId.length > 0) {
        // Place IDと名前を使った検索で詳細画面を表示
        url = `https://www.google.com/maps/search/?api=1&query=${encodedName}&query_place_id=${poiInfo.placeId}`;
      } else {
        // 座標ベースの検索
        url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      }
      window.open(url, '_blank');
    }
    
    setPoiInfo(null); // ポップアップを閉じる
  }, [poiInfo, setPoiInfo]);
  
  // POIの緯度経度から画面座標を計算
  const position = useMemo(() => {
    if (!poiInfo || !mapRegion || !mapSize) return null;
    const xy = latLonToXY(
      [poiInfo.coordinate.longitude, poiInfo.coordinate.latitude],
      mapRegion,
      mapSize,
      mapViewRef.current
    );
    return { x: xy[0], y: xy[1] };
  }, [poiInfo, mapRegion, mapSize, mapViewRef]);

  if (!poiInfo || !position) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: position.y - HEIGHT - 60,
        left: position.x - WIDTH / 2,
        zIndex: 1001,
        elevation: 1001,
      }}
    >
      <View
        style={{
          width: WIDTH,
          backgroundColor: COLOR.WHITE,
          borderRadius: 5,
          padding: 8,
        }}
      >
        <View style={{ alignItems: 'center' }}>
          <Pressable
            onPress={openGoogleMaps}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
            }}
          >
            <Text style={{ color: COLOR.BLUE, fontSize: 14, fontWeight: 'bold' }}>
              {t('Home.poi.openInGoogleMaps')}
            </Text>
          </Pressable>
        </View>
      </View>
      
      {/* 吹き出しの三角形 */}
      <View
        // eslint-disable-next-line react-native/no-color-literals
        style={{
          alignSelf: 'center',
          width: 10,
          height: 10,
          backgroundColor: 'transparent',
          borderStyle: 'solid',
          borderLeftWidth: 10,
          borderRightWidth: 10,
          borderTopWidth: 10,
          borderLeftColor: 'transparent',
          borderRightColor: 'transparent',
          borderTopColor: COLOR.WHITE,
        }}
      />
    </View>
  );
});