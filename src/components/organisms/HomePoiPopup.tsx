import React, { useContext, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import { View, Text, Linking, Platform } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { MapViewContext } from '../../contexts/MapView';
import { COLOR } from '../../constants/AppConstants';
import { latLonToXY } from '../../utils/Coords';
import { haversineKm, formatDistanceKm } from '../../utils/Location';
import { getDemElevation } from '../../utils/viewshed';
import { copyToClipboard } from '../../utils/Clipboard';
import { useWindow } from '../../hooks/useWindow';
import { MeasureContext } from '../../contexts/Measure';
import { DrawingToolsContext } from '../../contexts/DrawingTools';
import { isTerrain3DHandle } from '../../utils/terrain3d/types';
import { requestVistaOnEnter } from '../../utils/terrain3d/vistaStore';
import { useTerrain3dSupport } from '../../hooks/useTerrain3dSupport';
import { t } from '../../i18n/config';

/** 長押し位置を現在地へスナップする距離[px]（既存ポイントへのスナップと同じ） */
const CURRENT_LOCATION_SNAP_RADIUS_PX = 40;

export const HomePoiPopup = React.memo(() => {
  const {
    poiInfo,
    setPoiInfo,
    mapLocationInfo,
    setMapLocationInfo,
    mapViewRef,
    currentLocation,
    gpsState,
    pressCreateViewshed,
    isTerrainActive,
    toggleTerrain,
  } = useContext(MapViewContext);
  const { startMeasure } = useContext(MeasureContext);
  const { mapRegion, mapSize } = useWindow();
  const { featureButton } = useContext(DrawingToolsContext);
  const terrain3dSupported = useTerrain3dSupport();
  // 眺望はネイティブの3Dエンジンだけが持つ（Webのmaplibre地形には無い）。
  // 2Dからは3Dボタンが出ている状態（作図パネルを開いていない）に限る。3Dから戻れなくなるため
  const canVista =
    Platform.OS !== 'web' &&
    terrain3dSupported &&
    toggleTerrain !== undefined &&
    (isTerrainActive || featureButton === 'NONE');
  const WIDTH = 150;

  // POIまたは通常の地図位置のいずれかを取得
  const locationInfo = poiInfo || mapLocationInfo;
  const isPOI = !!poiInfo;

  // GPSがONで長押し位置が現在地の近く（画面上40px以内）なら、長押し位置を現在地へスナップする。
  // 現在地のマーカーを正確に長押しするのは難しく、「今いる場所」の標高・眺望等を見たい場面が多いため。
  // 判定は長押しした時点の1回だけ（GPS更新のたびに位置が動くと標高の取り直し等が走るため、現在地はrefで読む）
  const snapSourceRef = useRef({ gpsState, currentLocation, mapRegion, mapSize });
  snapSourceRef.current = { gpsState, currentLocation, mapRegion, mapSize };
  const snappedLocation = useMemo(() => {
    const source = snapSourceRef.current;
    const current = source.currentLocation;
    if (source.gpsState === 'off' || !current || !mapLocationInfo?.position) return null;
    const handle = mapViewRef.current;
    let xy: { x: number; y: number } | null;
    if (isTerrain3DHandle(handle)) {
      xy = handle.projectToScreen(current.latitude, current.longitude);
    } else {
      if (!source.mapRegion || !source.mapSize) return null;
      const p = latLonToXY([current.longitude, current.latitude], source.mapRegion, source.mapSize, handle);
      xy = { x: p[0], y: p[1] };
    }
    if (xy === null) return null;
    const { x, y } = mapLocationInfo.position;
    if (Math.hypot(xy.x - x, xy.y - y) > CURRENT_LOCATION_SNAP_RADIUS_PX) return null;
    return { latitude: current.latitude, longitude: current.longitude };
  }, [mapLocationInfo, mapViewRef]);
  const isSnapped = !isPOI && snappedLocation !== null;
  // メニュー・表示が対象とする地点
  const coordinate = isSnapped ? snappedLocation : locationInfo?.coordinate;

  // GPSがONのとき、長押し位置までの現在地からの直線距離を表示する（現在地へスナップしたら「現在地」と出す）
  const distanceText = useMemo(() => {
    if (isPOI || !coordinate || gpsState === 'off' || !currentLocation) return null;
    if (isSnapped) return t('Home.poi.currentLocation');
    const km = haversineKm(currentLocation, coordinate);
    const distance = formatDistanceKm(km);
    return t('Home.poi.distanceFromCurrentLocation', { distance });
  }, [isPOI, isSnapped, coordinate, gpsState, currentLocation]);

  // 長押し/POI位置の標高を標高タイル（Mapterhorn）から取得する
  // undefined: 取得中, null: 取得失敗（通信エラー等）, number: 標高(m)
  const lat = coordinate?.latitude;
  const lon = coordinate?.longitude;
  const [elevation, setElevation] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (lat == null || lon == null) {
      setElevation(undefined);
      return;
    }
    let cancelled = false;
    setElevation(undefined);
    getDemElevation(lat, lon).then((e) => {
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

  // 3Dでは可視領域・距離測定（2Dの地図操作が前提）を出さず、眺望だけを出す
  const menuItemCount = isPOI ? 0 : (canVista ? 1 : 0) + (isTerrainActive ? 0 : 2);
  const HEIGHT = 40 + (distanceText ? 20 : 0) + 20 + (coordinateText ? 20 : 0) + menuItemCount * 30;

  // その地点に立って真北を水平に見る視点へ3Dカメラを移す。
  // 2Dからは地点を預けて3Dへ切り替え、シーンの初期化後に眺望へ移してもらう
  const handleVista = useCallback(() => {
    if (!coordinate) return;
    const { latitude, longitude } = coordinate;
    const handle = mapViewRef.current;
    setPoiInfo(null);
    setMapLocationInfo(null);
    if (isTerrainActive) {
      if (isTerrain3DHandle(handle)) handle.moveToVista(latitude, longitude);
      return;
    }
    requestVistaOnEnter(latitude, longitude);
    toggleTerrain?.();
  }, [
    coordinate,
    mapViewRef,
    setPoiInfo,
    setMapLocationInfo,
    isTerrainActive,
    toggleTerrain,
  ]);

  // 長押し位置の可視領域作成ダイアログを開く（近くの既存ポイントがあればスナップ候補として渡す）
  const handleCreateViewshed = useCallback(() => {
    if (!coordinate) return;
    // 現在地へスナップしたときは、近くの既存ポイントへのスナップ候補は出さない
    const snapPoint = isSnapped ? undefined : mapLocationInfo?.snapPoint;
    setPoiInfo(null);
    setMapLocationInfo(null);
    pressCreateViewshed(coordinate, snapPoint);
  }, [coordinate, isSnapped, mapLocationInfo?.snapPoint, setPoiInfo, setMapLocationInfo, pressCreateViewshed]);

  // 長押し位置をA点として距離測定モードを開始する
  const handleMeasureDistance = useCallback(() => {
    if (!coordinate) return;
    setPoiInfo(null);
    setMapLocationInfo(null);
    startMeasure(coordinate);
  }, [coordinate, setPoiInfo, setMapLocationInfo, startMeasure]);

  const openGoogleMaps = useCallback(() => {
    if (!coordinate) return;
    
    const { latitude, longitude } = coordinate;
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
  }, [coordinate, isPOI, poiInfo, setPoiInfo, setMapLocationInfo]);
  
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
          {!isPOI && canVista && (
            <Pressable
              onPress={handleVista}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: COLOR.BLUE, fontSize: 14, fontWeight: 'bold' }}>
                {isSnapped ? t('Home.poi.vistaFromCurrentLocation') : t('Home.poi.vista')}
              </Text>
            </Pressable>
          )}
          {!isPOI && !isTerrainActive && (
            <Pressable
              onPress={handleCreateViewshed}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: COLOR.BLUE, fontSize: 14, fontWeight: 'bold' }}>
                {t('Home.poi.createViewshed')}
              </Text>
            </Pressable>
          )}
          {!isPOI && !isTerrainActive && (
            <Pressable
              onPress={handleMeasureDistance}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ color: COLOR.BLUE, fontSize: 14, fontWeight: 'bold' }}>
                {t('Home.poi.measureDistance')}
              </Text>
            </Pressable>
          )}
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