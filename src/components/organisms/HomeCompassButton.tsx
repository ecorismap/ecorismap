import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polygon, Text as SvgText } from 'react-native-svg';
import { COLOR } from '../../constants/AppConstants';
import { Pressable } from '../atoms/Pressable';
import { stepAngleToward, SMOOTHING_TAU_MS, SNAP_EPSILON_DEG, MIN_FRAME_INTERVAL_MS } from '../../utils/angle';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 方位盤の直径（pt）。40だとN/E/S/Wの文字が潰れるため一回り大きくする。
// 既存の左上ボタン列（中心x=29）と中心を揃えるためleftは5+insets.left。
const ROSE_SIZE = 48;

interface Props {
  azimuth: number;
  headingUp: boolean;
  onPressCompass: () => void;
  onLongPressCompass: () => void;
}

const areEqual = (prevProps: Props, nextProps: Props) => {
  // azimuthは磁気センサー由来のノイズで頻繁に変わるため、約1°超の変化のみ再レンダリングする
  if (Math.abs(prevProps.azimuth - nextProps.azimuth) > 1) return false;
  if (prevProps.headingUp !== nextProps.headingUp) return false;
  if (prevProps.onPressCompass !== nextProps.onPressCompass) return false;
  if (prevProps.onLongPressCompass !== nextProps.onLongPressCompass) return false;
  return true;
};

// 目盛り線。N/E/S/W位置は文字があるので目盛りは描かない。
// 8方位（斜め45°）は長め、16方位（22.5°刻みの中間）は短めの補助線。
const TICKS = Array.from({ length: 16 }, (_, i) => i * 22.5)
  .filter((deg) => deg % 90 !== 0)
  .map((deg) => {
    const rad = (deg * Math.PI) / 180;
    const c = ROSE_SIZE / 2;
    const innerR = deg % 45 === 0 ? 15 : 19;
    return {
      key: deg,
      x1: c + Math.sin(rad) * innerR,
      y1: c - Math.cos(rad) * innerR,
      x2: c + Math.sin(rad) * 23,
      y2: c - Math.cos(rad) * 23,
    };
  });

// 方位盤の盤面。盤全体が回転するので針は常に真北を指す。
// headingUp時はリングを青く太くして、コンパスモード中であることを示す。
const CompassRose = React.memo(({ headingUp }: { headingUp: boolean }) => (
  <Svg width={ROSE_SIZE} height={ROSE_SIZE} viewBox={`0 0 ${ROSE_SIZE} ${ROSE_SIZE}`}>
    <Circle
      testID="compass-ring"
      cx={24}
      cy={24}
      r={22.5}
      fill={COLOR.ALFAWHITE}
      stroke={headingUp ? COLOR.BLUE : COLOR.GRAY4}
      strokeWidth={headingUp ? 2 : 1}
    />
    {TICKS.map((t) => (
      <Line key={t.key} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={COLOR.GRAY3} strokeWidth={1} />
    ))}
    <SvgText x={24} y={13} fontSize={9} fontWeight="bold" fill={COLOR.RED} textAnchor="middle">
      N
    </SvgText>
    <SvgText x={38} y={27} fontSize={8} fill={COLOR.BLACK} textAnchor="middle">
      E
    </SvgText>
    <SvgText x={24} y={41} fontSize={8} fill={COLOR.BLACK} textAnchor="middle">
      S
    </SvgText>
    <SvgText x={10} y={27} fontSize={8} fill={COLOR.BLACK} textAnchor="middle">
      W
    </SvgText>
    <Polygon points="24,15 26.5,24 21.5,24" fill={COLOR.RED} />
    <Polygon points="24,33 21.5,24 26.5,24" fill={COLOR.GRAY3} />
    {headingUp && <Circle cx={24} cy={24} r={2.5} fill={COLOR.BLUE} />}
  </Svg>
));

export const HomeCompassButton = React.memo((props: Props) => {
  const { azimuth, headingUp, onPressCompass, onLongPressCompass } = props;
  const insets = useSafeAreaInsets();

  // 方位の表示角度。azimuth propは間引かれて階段状に届くため、
  // north-up時はrAFループで連続補間して滑らかに回す（HomeCurrentMarkerと同方針）。
  // headingUp時は補間せず即時スナップ（azimuthはカメラ回転コマンドと同期した値なので、
  // 補間するとカメラ回転とズレて見える）。
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
      if (dt < MIN_FRAME_INTERVAL_MS) {
        rafIdRef.current = requestAnimationFrame(tick);
        return;
      }
      lastFrameTsRef.current = now;

      const target = targetAzimuthRef.current;
      const current = displayAzimuthRef.current;
      const remaining = Math.abs(((target - current + 540) % 360) - 180);
      if (remaining < SNAP_EPSILON_DEG) {
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

  // 盤面はノースアップ時も端末の向きに追従して回す（実際のコンパスと同じ感覚で東西南北がわかる）
  const rotation = useMemo(() => (360 - displayAzimuth) % 360, [displayAzimuth]);

  return (
    <View
      style={{
        left: 5 + insets.left,
        position: 'absolute',
        top: insets.top + 10,
      }}
    >
      {/* タッチ判定は非回転のPressableが受け持つ（回転による当たり判定のブレ防止） */}
      <Pressable
        testID="home-compass-button"
        accessibilityLabel="compass"
        onPress={onPressCompass}
        onLongPress={onLongPressCompass}
        style={{ width: ROSE_SIZE, height: ROSE_SIZE, borderRadius: ROSE_SIZE / 2 }}
      >
        <View testID="compass-rose-rotator" style={{ transform: [{ rotate: `${rotation}deg` }] }}>
          <CompassRose headingUp={headingUp} />
        </View>
      </Pressable>
    </View>
  );
}, areEqual);
