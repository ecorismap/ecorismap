import React, { useMemo, useRef } from 'react';
import { useCallback } from 'react';
import MapView, { Region } from 'react-native-maps';
import { MapRef, ViewState } from 'react-map-gl/maplibre';
import { Platform } from 'react-native';
import { isMapRef, isMapView, isRegion, isRegionType, isViewState } from '../utils/Map';
import { useWindow } from './useWindow';
import { RegionType } from '../types';
import { editSettingsAction } from '../modules/settings';
import { deltaToZoom, zoomToDelta } from '../utils/Coords';
import { isTerrain3DHandle } from '../utils/terrain3d/types';
import { useDispatch } from 'react-redux';
import { isMapRotated, mapHeadingStore } from '../utils/mapHeadingStore';

export type UseMapViewReturnType = {
  zoom: number;
  zoomDecimal: number;
  zoomIn: () => void;
  zoomOut: () => void;
  changeMapRegion: (region: Region | ViewState | undefined, jumpTo?: boolean) => void;
  syncMapHeading: () => void;
};

export const useMapView = (mapViewRefObj: React.RefObject<MapView | MapRef | null>): UseMapViewReturnType => {
  const { windowWidth, mapRegion } = useWindow();
  const dispatch = useDispatch();
  const regionChangeSeq = useRef(0);
  const headingRequestInFlight = useRef(false);

  const zoomDecimal = useMemo(() => {
    if (mapRegion) {
      // 地図回転中はregionのdeltaが回転後のバウンディングボックスに膨らみズームを誤算するため、
      // ネイティブもカメラ由来のzoom（changeMapRegionで保存）をそのまま使う
      if (Number.isFinite(mapRegion.zoom)) {
        return mapRegion.zoom;
      } else if (mapRegion.longitudeDelta < 0) {
        return Math.log2(360 * (windowWidth / 256 / (mapRegion.longitudeDelta + 360)));
      } else {
        return Math.log2(360 * (windowWidth / 256 / mapRegion.longitudeDelta));
      }
    } else {
      return 5;
    }
  }, [mapRegion, windowWidth]);

  const zoom = useMemo(() => Math.floor(zoomDecimal), [zoomDecimal]);

  const zoomIn = useCallback(() => {
    // 3D切替などでrefの中身が差し替わるため、呼び出し時点のcurrentを解決する
    const mapViewRef = mapViewRefObj.current;
    // 3Dはカメラ側の値を基準にする（mapRegionはカメラ同期の間引きで遅れるため、
    // 連続で押すと同じズームを指し続けて効かなくなる）
    if (isTerrain3DHandle(mapViewRef)) {
      mapViewRef.zoomBy(1);
      return;
    }
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    const coords = {
      latitude: latitude,
      longitude: longitude,
      latitudeDelta: latitudeDelta / 2,
      longitudeDelta: longitudeDelta / 2,
    };
    if (isMapView(mapViewRef) && isMapRotated(mapRegion.bearing) && Number.isFinite(mapRegion.zoom)) {
      // animateToRegionは外接矩形へ合わせるため回転が北へ戻り、回転中のdeltaは外接矩形で膨らんでいる。
      // 手で回した地図はカメラのズームだけを変える
      mapViewRef.animateCamera({ zoom: mapRegion.zoom + 1 }, { duration: 200 });
    } else if (isMapView(mapViewRef)) {
      mapViewRef.animateToRegion(coords, 200);
    } else if (isMapRef(mapViewRef)) {
      const mapRef = mapViewRef.getMap();
      mapRef.flyTo({ center: [longitude, latitude], zoom: mapRef.getZoom() + 1, essential: true });
    }
  }, [mapRegion, mapViewRefObj]);

  const zoomOut = useCallback(() => {
    const mapViewRef = mapViewRefObj.current;
    if (isTerrain3DHandle(mapViewRef)) {
      mapViewRef.zoomBy(-1);
      return;
    }
    const { latitude, longitude, latitudeDelta, longitudeDelta } = mapRegion;
    const coords = {
      latitude: latitude,
      longitude: longitude,
      latitudeDelta: latitudeDelta * 2,
      longitudeDelta: longitudeDelta * 2,
    };
    if (isMapView(mapViewRef) && isMapRotated(mapRegion.bearing) && Number.isFinite(mapRegion.zoom)) {
      mapViewRef.animateCamera({ zoom: mapRegion.zoom - 1 }, { duration: 200 });
    } else if (isMapView(mapViewRef)) {
      mapViewRef.animateToRegion(coords, 200);
    } else if (isMapRef(mapViewRef)) {
      const mapRef = mapViewRef.getMap();
      mapRef.flyTo({
        center: [longitude, latitude],
        zoom: mapRef.getZoom() === 0 ? 0 : mapRef.getZoom() - 1,
        essential: true,
      });
    }
  }, [mapRegion, mapViewRefObj]);

  const changeMapRegion = useCallback(
    (region: Region | ViewState | RegionType | undefined, jumpTo = false) => {
      const mapViewRef = mapViewRefObj.current;
      if (region === undefined) return;
      if (Platform.OS === 'web') {
        if (isRegionType(region)) {
          dispatch(editSettingsAction({ mapRegion: region }));
        } else if (isViewState(region)) {
          if (mapViewRef === null) {
            dispatch(editSettingsAction({ mapRegion: { ...region, latitudeDelta: 0.001, longitudeDelta: 0.001 } }));
          } else if (isMapRef(mapViewRef)) {
            const { latitudeDelta, longitudeDelta } = zoomToDelta(mapViewRef);
            dispatch(editSettingsAction({ mapRegion: { ...region, latitudeDelta, longitudeDelta } }));
          }
        }
      } else {
        if (isRegion(region) && !isRegionType(region)) {
          const delta = { longitudeDelta: region.longitudeDelta, latitudeDelta: region.latitudeDelta };
          const fallbackZoom = deltaToZoom(windowWidth, delta).decimalZoom;
          const seq = ++regionChangeSeq.current;
          if (isMapView(mapViewRef)) {
            // deltaは回転時に膨らんでズームを誤算するため、カメラの実ズームを採用する
            mapViewRef
              .getCamera()
              .then((camera) => {
                if (seq !== regionChangeSeq.current) return;
                const cameraZoom = Number.isFinite(camera.zoom) ? (camera.zoom as number) : fallbackZoom;
                // 方位は画面座標⇔緯度経度の変換（回転時）と3Dへの引き継ぎに使う
                const bearing = Number.isFinite(camera.heading) ? camera.heading : 0;
                mapHeadingStore.set(bearing);
                dispatch(editSettingsAction({ mapRegion: { ...region, zoom: cameraZoom, bearing } }));
              })
              .catch(() => {
                if (seq !== regionChangeSeq.current) return;
                dispatch(editSettingsAction({ mapRegion: { ...region, zoom: fallbackZoom } }));
              });
          } else {
            dispatch(editSettingsAction({ mapRegion: { ...region, zoom: fallbackZoom } }));
          }
        } else if (jumpTo && isRegionType(region) && isMapView(mapViewRef)) {
          mapViewRef.setCamera({
            center: {
              latitude: region.latitude,
              longitude: region.longitude,
            },
            zoom: region.zoom,
          });
        }
      }
    },
    [dispatch, mapViewRefObj, windowWidth]
  );

  // 回転操作中のカメラ方位をコンパス盤面・現在地マーカーへ流す（ネイティブ2Dのみ）。
  // regionイベントには方位が含まれないためgetCameraで取得する。問い合わせは同時に1つまでに絞り、
  // 応答待ちの間に来たイベントは捨てる（次のイベントか移動完了時のchangeMapRegionで追いつく）
  const syncMapHeading = useCallback(() => {
    const mapViewRef = mapViewRefObj.current;
    if (!isMapView(mapViewRef) || headingRequestInFlight.current) return;
    headingRequestInFlight.current = true;
    mapViewRef
      .getCamera()
      .then((camera) => {
        if (Number.isFinite(camera.heading)) mapHeadingStore.set(camera.heading);
      })
      .catch(() => undefined)
      .finally(() => {
        headingRequestInFlight.current = false;
      });
  }, [mapViewRefObj]);

  return { zoom, zoomDecimal, zoomIn, zoomOut, changeMapRegion, syncMapHeading } as const;
};
