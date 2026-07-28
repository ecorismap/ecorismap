import React from 'react';
import { render, act } from '@testing-library/react-native';
import type { RenderResult } from '@testing-library/react-native';
import { CurrentMarker, stepAngleToward } from '../HomeCurrentMarker';
import { LocationType } from '../../../types';

// プロップを検査しやすいホスト要素として描画するローカルモック
// （jestSetupFile.jsのグローバルモックはCircle未定義のためここで上書きする）
jest.mock('react-native-maps', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    Marker: (props: any) => mockReact.createElement('Marker', props),
    Polyline: (props: any) => mockReact.createElement('Polyline', props),
    Circle: (props: any) => mockReact.createElement('Circle', props),
  };
});

describe('stepAngleToward', () => {
  it('目標角度へ向かって単調に近づく', () => {
    const next = stepAngleToward(0, 90, 33, 180);
    expect(next).toBeGreaterThan(0);
    expect(next).toBeLessThan(90);
    const next2 = stepAngleToward(next, 90, 33, 180);
    expect(next2).toBeGreaterThan(next);
    expect(next2).toBeLessThan(90);
  });

  it('0/360のラップを跨いで短い方向に回る（350→10は+方向）', () => {
    const next = stepAngleToward(350, 10, 33, 180);
    // 350から+方向へ進む（350超か、360を跨いで10未満）
    const wrapped = next > 350 || next < 10;
    expect(wrapped).toBe(true);
    // 逆回り（350→10へ-340°回る）になっていないこと
    expect(next).not.toBeLessThan(340);
  });

  it('10→350は-方向（反時計回り）に回る', () => {
    const next = stepAngleToward(10, 350, 33, 180);
    const wrapped = next < 10 || next > 350;
    expect(wrapped).toBe(true);
  });

  it('dtが大きいほど1ステップで大きく進む（実時間ベースの収束）', () => {
    const small = stepAngleToward(0, 90, 16, 180);
    const large = stepAngleToward(0, 90, 100, 180);
    expect(large).toBeGreaterThan(small);
  });

  it('目標と一致していれば動かない', () => {
    expect(stepAngleToward(45, 45, 33, 180)).toBe(45);
  });
});

describe('CurrentMarker', () => {
  const currentLocation: LocationType = {
    latitude: 35,
    longitude: 135,
    accuracy: 5,
  } as LocationType;

  let now: number;
  let dateNowSpy: jest.SpyInstance;
  let rafQueue: Map<number, FrameRequestCallback>;
  let rafSeq: number;
  let cancelSpy: jest.Mock;

  beforeEach(() => {
    now = 1_000_000;
    dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);
    rafQueue = new Map();
    rafSeq = 0;
    (global as any).requestAnimationFrame = jest.fn((cb: FrameRequestCallback) => {
      rafSeq += 1;
      rafQueue.set(rafSeq, cb);
      return rafSeq;
    });
    cancelSpy = jest.fn((id: number) => {
      rafQueue.delete(id);
    });
    (global as any).cancelAnimationFrame = cancelSpy;
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  // 1フレーム進める（時間をadvanceMsだけ進めて保留中のrAFコールバックを実行）
  const flushFrame = async (advanceMs = 34) => {
    now += advanceMs;
    const callbacks = [...rafQueue.values()];
    rafQueue.clear();
    await act(async () => {
      callbacks.forEach((cb) => cb(now));
    });
  };

  // 現在地マーカー（image propあり）と画面固定線マーカー（子ビュー、image propなし）を区別する
  const getCurrentMarker = (tree: RenderResult) =>
    tree.container.queryAll((i) => i.type === 'Marker' && i.props.image !== undefined)[0];

  const queryLineMarkers = (tree: RenderResult) =>
    tree.container.queryAll((i) => i.type === 'Marker' && i.props.image === undefined);

  const getMarkerRotation = (tree: RenderResult) => getCurrentMarker(tree).props.rotation;

  const getLineCoordinates = (tree: RenderResult) =>
    tree.container.queryAll((i) => i.type === 'Polyline')[0].props.coordinates;

  it('north-up時: azimuth変更でrotationが段階的に目標へ収束する', async () => {
    const tree = await render(
      <CurrentMarker currentLocation={currentLocation} azimuth={0} headingUp={false} showDirectionLine={false} />
    );
    expect(getMarkerRotation(tree)).toBe(0);

    await tree.rerender(
      <CurrentMarker currentLocation={currentLocation} azimuth={90} headingUp={false} showDirectionLine={false} />
    );

    await flushFrame();
    const first = getMarkerRotation(tree);
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(90);

    await flushFrame();
    const second = getMarkerRotation(tree);
    expect(second).toBeGreaterThan(first);
    expect(second).toBeLessThan(90);

    // 収束するまでフレームを進めると目標値にスナップしてループが停止する
    for (let i = 0; i < 200 && rafQueue.size > 0; i++) {
      await flushFrame();
    }
    expect(getMarkerRotation(tree)).toBe(90);
    expect(rafQueue.size).toBe(0);
  });

  it('headingUp時: マーカーは真上固定・方角線は画面固定Marker(rotation=0)でPolylineと補間は使わない', async () => {
    const tree = await render(
      <CurrentMarker currentLocation={currentLocation} azimuth={0} headingUp={true} showDirectionLine={true} />
    );

    await tree.rerender(
      <CurrentMarker currentLocation={currentLocation} azimuth={90} headingUp={true} showDirectionLine={true} />
    );

    // 現在地マーカー自体は真上向きのまま
    expect(getMarkerRotation(tree)).toBe(0);
    // 補間ループは起動しない
    expect(rafQueue.size).toBe(0);

    // 地理座標のPolylineは描画されない（回転アニメーションとの位相ズレで揺れるため）
    expect(tree.container.queryAll((i) => i.type === 'Polyline').length).toBe(0);

    // 代わりに画面固定の線Marker: rotation=0のビルボードは地図回転に関わらず画面真上を向く
    const lineMarkers = queryLineMarkers(tree);
    expect(lineMarkers.length).toBe(1);
    const lineMarker = lineMarkers[0];
    expect(lineMarker.props.rotation).toBe(0);
    expect(lineMarker.props.flat).toBe(false);
    // 線の下端が現在地に一致するようbottom-centerアンカー
    expect(lineMarker.props.anchor).toEqual({ x: 0.5, y: 1 });
    expect(lineMarker.props.coordinate).toEqual({ latitude: 35, longitude: 135 });
  });

  it('north-up時: 画面固定線Markerは使わずPolylineで描画する', async () => {
    const tree = await render(
      <CurrentMarker currentLocation={currentLocation} azimuth={0} headingUp={false} showDirectionLine={true} />
    );
    expect(queryLineMarkers(tree).length).toBe(0);
    expect(tree.container.queryAll((i) => i.type === 'Polyline').length).toBe(1);
  });

  it('north-up時: 方角線もrotationと同じ補間角度から描画される', async () => {
    const tree = await render(
      <CurrentMarker currentLocation={currentLocation} azimuth={0} headingUp={false} showDirectionLine={true} />
    );
    await tree.rerender(
      <CurrentMarker currentLocation={currentLocation} azimuth={90} headingUp={false} showDirectionLine={true} />
    );
    await flushFrame();

    const rotation = getMarkerRotation(tree);
    const line = getLineCoordinates(tree);
    const angleRad = ((90 - rotation) * Math.PI) / 180;
    expect(line[1].latitude).toBeCloseTo(35 + 10 * Math.sin(angleRad), 5);
  });

  it('unmountで補間ループがキャンセルされる', async () => {
    const tree = await render(
      <CurrentMarker currentLocation={currentLocation} azimuth={0} headingUp={false} showDirectionLine={false} />
    );
    await tree.rerender(
      <CurrentMarker currentLocation={currentLocation} azimuth={90} headingUp={false} showDirectionLine={false} />
    );
    expect(rafQueue.size).toBe(1);

    await tree.unmount();
    expect(cancelSpy).toHaveBeenCalled();
    expect(rafQueue.size).toBe(0);
  });
});
