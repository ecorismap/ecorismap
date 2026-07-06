import React, { useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { View, Text, Linking, Platform } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { MapViewContext } from '../../contexts/MapView';
import { COLOR } from '../../constants/AppConstants';
import { latLonToXY } from '../../utils/Coords';
import { haversineKm } from '../../utils/Location';
import { getGsiElevation } from '../../utils/Elevation';
import { copyToClipboard } from '../../utils/Clipboard';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';

export const HomePoiPopup = React.memo(() => {
  const { poiInfo, setPoiInfo, mapLocationInfo, setMapLocationInfo, mapViewRef, currentLocation, gpsState } =
    useContext(MapViewContext);
  const { mapRegion, mapSize } = useWindow();
  const WIDTH = 150;

  // POIまたは通常の地図位置のいずれかを取得
  const locationInfo = poiInfo || mapLocationInfo;
  const isPOI = !!poiInfo;

  // GPSがONのとき、長押し位置までの現在地からの直線距離を表示する
  const distanceText = useMemo(() => {
    if (isPOI || !locationInfo || gpsState === 'off' || !currentLocation) return null;
    const km = haversineKm(currentLocation, locationInfo.coordinate);
    const distance = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(2)} km`;
    return t('Home.poi.distanceFromCurrentLocation', { distance });
  }, [isPOI, locationInfo, gpsState, currentLocation]);

  // 長押し/POI位置の標高を国土地理院APIから取得する
  // undefined: 取得中, null: 取得失敗（範囲外等）, number: 標高(m)
  const lat = locationInfo?.coordinate.latitude;
  const lon = locationInfo?.coordinate.longitude;
  const [elevation, setElevation] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (lat == null || lon == null) {
      setElevation(undefined);
      return;
    }
    let cancelled = false;
    setElevation(undefined);
    getGsiElevation(lat, lon).then((e) => {
      if (!cancelled) setElevation(e);
    });
    return () => {
      cancelled = true;
    };
  }, [lat, lon]);

  const elevationText = useMemo(() => {
    if (elevation === undefined) return t('Home.poi.elevation', { elevation: '…' });
    if (elevation === null) return t('Home.poi.elevationUnavailable');
    return t('Home.poi.elevation', { elevation: elevation.toFixed(1) });
  }, [elevation]);

  // 緯度経度を表示（小数5桁 ≒ 1m精度）。タップでクリップボードにコピー
  const coordinateText = useMemo(() => {
    if (lat == null || lon == null) return null;
    return `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
  }, [lat, lon]);

  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCopied(false);
  }, [lat, lon]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopyCoordinate = useCallback(async () => {
    if (!coordinateText) return;
    const success = await copyToClipboard(coordinateText);
    if (success) setCopied(true);
  }, [coordinateText]);

  const HEIGHT = 40 + (distanceText ? 20 : 0) + 20 + (coordinateText ? 20 : 0);

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
          {distanceText && (
            <Text style={{ color: COLOR.GRAY4, fontSize: 12, paddingBottom: 4 }}>{distanceText}</Text>
          )}
          <Text style={{ color: COLOR.GRAY4, fontSize: 12, paddingBottom: 4 }}>{elevationText}</Text>
          {coordinateText && (
            <Pressable onPress={handleCopyCoordinate} style={{ paddingBottom: 4 }}>
              <Text style={{ color: copied ? COLOR.GRAY4 : COLOR.BLUE, fontSize: 12 }}>
                {copied ? t('Home.poi.copied') : coordinateText}
              </Text>
            </Pressable>
          )}
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