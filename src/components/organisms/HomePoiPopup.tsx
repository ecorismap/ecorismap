import React, { useContext, useCallback, useMemo } from 'react';
import { View, Text, Linking, Platform } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { MapViewContext } from '../../contexts/MapView';
import { COLOR } from '../../constants/AppConstants';
import { latLonToXY } from '../../utils/Coords';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';

export const HomePoiPopup = React.memo(() => {
  const { poiInfo, setPoiInfo, mapLocationInfo, setMapLocationInfo, mapViewRef } = useContext(MapViewContext);
  const { mapRegion, mapSize } = useWindow();
  const WIDTH = 150;
  const HEIGHT = 40;
  
  // POIまたは通常の地図位置のいずれかを取得
  const locationInfo = poiInfo || mapLocationInfo;
  const isPOI = !!poiInfo;
  
  const openGoogleMaps = useCallback(() => {
    if (!locationInfo) return;
    
    const { latitude, longitude } = locationInfo.coordinate;
    const encodedName = isPOI && poiInfo ? encodeURIComponent(poiInfo.name) : '';
    
    let url: string;
    if (Platform.OS === 'ios') {
      // iOS用のGoogle Maps URLスキーム
      if (isPOI && poiInfo && poiInfo.placeId && poiInfo.placeId.length > 0) {
        // Place IDがある場合は詳細ページへ
        url = `comgooglemaps://?q=${encodedName}&center=${latitude},${longitude}`;
      } else {
        // Place IDがない場合は座標で検索
        url = `comgooglemaps://?q=${latitude},${longitude}`;
      }
      
      // Google Mapsアプリがインストールされていない場合のフォールバック
      Linking.canOpenURL(url).then(supported => {
        if (!supported) {
          if (isPOI && poiInfo && poiInfo.placeId && poiInfo.placeId.length > 0) {
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
      if (isPOI && poiInfo && poiInfo.placeId && poiInfo.placeId.length > 0) {
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
      if (isPOI && poiInfo && poiInfo.placeId && poiInfo.placeId.length > 0) {
        // Place IDと名前を使った検索で詳細画面を表示
        url = `https://www.google.com/maps/search/?api=1&query=${encodedName}&query_place_id=${poiInfo.placeId}`;
      } else {
        // 座標ベースの検索
        url = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
      }
      window.open(url, '_blank');
    }
    
    setPoiInfo(null); // POIポップアップを閉じる
    setMapLocationInfo(null); // 地図位置ポップアップを閉じる
  }, [locationInfo, isPOI, poiInfo, setPoiInfo, setMapLocationInfo]);
  
  // 画面座標を計算
  const position = useMemo(() => {
    if (!locationInfo) return null;
    
    // 長押しの場合（mapLocationInfo）は保存されているpositionを使用
    if (!isPOI && mapLocationInfo?.position) {
      return mapLocationInfo.position;
    }
    
    // POIの場合は緯度経度から計算
    if (!mapRegion || !mapSize) return null;
    const xy = latLonToXY(
      [locationInfo.coordinate.longitude, locationInfo.coordinate.latitude],
      mapRegion,
      mapSize,
      mapViewRef.current
    );
    return { x: xy[0], y: xy[1] };
  }, [locationInfo, isPOI, mapLocationInfo, mapRegion, mapSize, mapViewRef]);

  if (!locationInfo || !position) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: isPOI ? position.y - HEIGHT - 50 : position.y - HEIGHT - 20, // POIは50px上にずらし、長押しは吹き出しを10px追加でずらす
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