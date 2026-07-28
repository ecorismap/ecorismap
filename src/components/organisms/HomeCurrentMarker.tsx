import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Marker, Polyline, Circle } from 'react-native-maps';
import { COLOR } from '../../constants/AppConstants';
import { LocationType } from '../../types';

// 表示角度を目標角度へ1フレーム分近づける指数平滑ステップ（角度ラップ考慮）。
// 係数を k = 1 - exp(-dt/τ) とすることで、フレーム落ちや更新間引きがあっても
// 実時間ベースの収束速度が一定になる。
export const stepAngleToward = (current: number, target: number, dtMs: number, tauMs: number): number => {
  // 差を-180..180に正規化（359→1は+2として扱う）
  const delta = ((target - current + 540) % 360) - 180;
  const k = 1 - Math.exp(-dtMs / tauMs);
  const next = current + delta * k;
  return ((next % 360) + 360) % 360;
};

// 補間の時定数（小さいほど機敏、大きいほど滑らか）
const SMOOTHING_TAU_MS = 180;
// 目標との差がこの角度未満になったら補間ループを停止（静止時のCPU消費を抑える）
const SNAP_EPSILON_DEG = 0.2;
// Marker rotation / Polyline のネイティブ更新頻度の上限（Fabric負荷緩和のため実質30fps）
const MIN_FRAME_INTERVAL_MS = 33;

interface Props {
  currentLocation: LocationType;
  azimuth: number;
  headingUp: boolean;
  onPress?: () => void;
  showDirectionLine?: boolean;
  // キャッシュ由来の古い位置（衛星捕捉中）。灰色マーカーで表示し精度円は出さない。
  isStale?: boolean;
}

// 不要な再レンダリングを防ぐカスタム比較（HomeCompassButtonと同方針）。
// azimuthは磁気センサー由来のノイズで頻繁に変わるため、約1°超の変化のみ再レンダリングする。
const arePropsEqual = (prev: Props, next: Props) => {
  if (prev.isStale !== next.isStale) return false;
  if (prev.headingUp !== next.headingUp) return false;
  if (prev.onPress !== next.onPress) return false;
  if (prev.showDirectionLine !== next.showDirectionLine) return false;

  const a = prev.currentLocation;
  const b = next.currentLocation;
  if (a.latitude !== b.latitude || a.longitude !== b.longitude || (a.accuracy ?? 0) !== (b.accuracy ?? 0)) {
    return false;
  }

  if (Math.abs(prev.azimuth - next.azimuth) > 1) return false;

  return true;
};

const CurrentMarkerComponent = (props: Props) => {
  const { currentLocation, azimuth, headingUp, onPress, showDirectionLine, isStale } = props;
  const accuracy = currentLocation.accuracy ?? 0;
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  // 画面固定線の長さ: 画面のどこにマーカーがあっても画面端まで届く長さ（対角線）
  const screenLineLength = Math.ceil(Math.sqrt(windowWidth * windowWidth + windowHeight * windowHeight));
  const fillColor = accuracy > 30 ? '#bbbbbbaa' : accuracy > 15 ? '#ff9900aa' : '#ff0000aa';

  // マーカー画像の選択（stale=キャッシュ由来の古い位置は精度に関わらず灰色）
  const markerImage = useMemo(() => {
    if (isStale) return require('../../assets/marker_gray.png');
    if (accuracy > 30) return require('../../assets/marker_gray.png');
    if (accuracy > 15) return require('../../assets/marker_orange.png');
    return require('../../assets/marker_red.png');
  }, [accuracy, isStale]);

  // 方位の表示角度。azimuth propは間引かれて階段状に届くため、
  // north-up時はrAFループで連続補間して滑らかに回す。
  // headingUp時は補間せず即時スナップ（azimuthはカメラ回転コマンドと同期した値なので、
  // 補間するとカメラとズレて方角線が揺れる）。
  const targetAzimuthRef = useRef(azimuth);
  const displayAzimuthRef = useRef(azimuth);
  const rafIdRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef(0);
  const [displayAzimuth, setDisplayAzimuth] = useState(azimuth);

  const stopAnimation = useCallback(() => {
    if (rafIdRef.current !== null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    targetAzimuthRef.current = azimuth;

    if (headingUp) {
      // カメラと同値同タイミングで方角線を更新するため即時スナップ
      stopAnimation();
      displayAzimuthRef.current = azimuth;
      setDisplayAzimuth(azimuth);
      return;
    }

    if (rafIdRef.current !== null) return; // ループ稼働中なら目標値の更新のみ

    lastFrameTsRef.current = Date.now();
    const tick = () => {
      const now = Date.now();
      const dt = now - lastFrameTsRef.current;
      // ネイティブ更新を実質30fpsに間引く（次フレームで再評価）
      if (dt < MIN_FRAME_INTERVAL_MS) {
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameTsRef.current = now;

      const target = targetAzimuthRef.current;
      const current = displayAzimuthRef.current;
      const remaining = Math.abs(((target - current + 540) % 360) - 180);
      if (remaining < SNAP_EPSILON_DEG) {
        // 目標に到達したのでスナップしてループ停止
        rafIdRef.current = null;
        if (remaining > 0) {
          displayAzimuthRef.current = target;
          setDisplayAzimuth(target);
        }
        return;
      }

      const next = stepAngleToward(current, target, dt, SMOOTHING_TAU_MS);
      displayAzimuthRef.current = next;
      setDisplayAzimuth(next);
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  }, [azimuth, headingUp, stopAnimation]);

  useEffect(() => stopAnimation, [stopAnimation]);

  const markerAngle = useMemo(() => {
    return headingUp ? 0 : displayAzimuth;
  }, [headingUp, displayAzimuth]);

  // redraw() は使用しない (iOS での初動ちらつき軽減)

  // north-up時の方角線（地理座標のPolyline）。
  // headingUp時は使わない: 地図回転はanimateCameraのアニメーションで遅れて追従するため、
  // 地理座標の線では回転中に必ず位相ズレして揺れる。代わりに画面固定のMarker線を描く。
  const lineCoordinates = useMemo(() => {
    if (!showDirectionLine || headingUp) return [];

    // 補間済みの表示角度で滑らかに回る
    const lineAngle = displayAzimuth;
    const angleRad = ((90 - lineAngle) * Math.PI) / 180;

    // Calculate the end point (far away)
    const lineDistance = 10; // 10 degrees
    const endLat = currentLocation.latitude + lineDistance * Math.sin(angleRad);
    const endLon =
      currentLocation.longitude +
      (lineDistance * Math.cos(angleRad)) / Math.cos((currentLocation.latitude * Math.PI) / 180);

    return [
      {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
      },
      {
        latitude: endLat,
        longitude: endLon,
      },
    ];
  }, [currentLocation, showDirectionLine, headingUp, displayAzimuth]);

  return (
    <>
      {/* staleのとき精度円は出さない: キャッシュのaccuracyは取得当時の精度であり
          現在位置の不確かさを表さない（小さい円が誤った確信を与える）ため */}
      {!isStale && accuracy > 0 && (
        <Circle
          center={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          }}
          radius={accuracy}
          fillColor={fillColor.replace('aa', '33')} // More transparent fill
          strokeColor={fillColor}
          strokeWidth={1}
          zIndex={999}
        />
      )}
      {showDirectionLine && !headingUp && lineCoordinates.length > 0 && (
        <Polyline coordinates={lineCoordinates} strokeColor="#000000" strokeWidth={1} zIndex={1000} />
      )}
      {/* headingUp時の方角線: ビルボードMarker(rotation=0)は地図の回転アニメーションに
          関わらず常に画面の真上を向いて描画されるため、同期処理なしで完全に真上固定になる。
          anchor(bottom-center)で線の下端を現在地に合わせ、上方向へ画面対角線の長さだけ伸ばす */}
      {showDirectionLine && headingUp && (
        <Marker
          coordinate={{
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          }}
          anchor={{ x: 0.5, y: 1 }}
          centerOffset={{ x: 0, y: -screenLineLength / 2 }}
          rotation={0}
          flat={false}
          tracksViewChanges={false}
          style={{ zIndex: 1000 }}
        >
          <View style={[styles.screenDirectionLine, { height: screenLineLength }]} />
        </Marker>
      )}
      <Marker
        coordinate={{
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
        }}
        rotation={markerAngle}
        anchor={{ x: 0.5, y: 0.5 }}
        style={{ zIndex: 1001 }}
        onPress={onPress}
        image={markerImage}
      />
    </>
  );
};

const styles = StyleSheet.create({
  screenDirectionLine: {
    backgroundColor: COLOR.BLACK,
    width: 2,
  },
});

export const CurrentMarker = React.memo(CurrentMarkerComponent, arePropsEqual);
