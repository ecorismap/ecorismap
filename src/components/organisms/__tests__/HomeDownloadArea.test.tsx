import React from 'react';
import { render } from '@testing-library/react-native';
import { DownloadArea } from '../HomeDownloadArea';
import { TileRegionType } from '../../../types';

jest.mock('react-native-maps', () => {
  const mockReact = require('react');
  return {
    __esModule: true,
    Polygon: (props: object) => mockReact.createElement('Polygon', props),
    Polyline: (props: object) => mockReact.createElement('Polyline', props),
  };
});

const coords: TileRegionType['coords'] = [
  { latitude: 34.0, longitude: 134.0 },
  { latitude: 34.1, longitude: 134.0 },
  { latitude: 34.1, longitude: 134.1 },
  { latitude: 34.0, longitude: 134.1 },
];
const region = (id: string, status?: TileRegionType['status']): TileRegionType => ({
  id,
  tileMapId: 'M1',
  coords,
  centroid: { latitude: 34.05, longitude: 134.05 },
  ...(status ? { status, zoom: 11 } : {}),
});
const downloadArea = region('');

type View = Awaited<ReturnType<typeof render>>;
const byType = (view: View, type: string) => view.container.queryAll((node) => node.type === type);

describe('DownloadArea（地図タイル監査 M-L2）', () => {
  it('保存済みの範囲は従来どおりオレンジの実線で描く', async () => {
    const view = await render(
      <DownloadArea downloadArea={downloadArea} savedArea={[region('A')]} onPress={jest.fn()} />
    );
    const polygons = byType(view, 'Polygon');
    // 保存済み1つ + ダウンロード範囲1つ
    expect(polygons).toHaveLength(2);
    expect(polygons[0].props.fillColor).toBe('rgba(255,165,0,0.2)');
    expect(polygons[0].props.strokeWidth).toBe(2);
    expect(byType(view, 'Polyline')).toHaveLength(0);
  });

  it('ダウンロード中・一時停止の範囲は保存済みと違う色の塗りと破線の枠で描く', async () => {
    const view = await render(
      <DownloadArea
        downloadArea={downloadArea}
        savedArea={[region('A'), region('B', 'paused'), region('C', 'downloading')]}
        onPress={jest.fn()}
      />
    );
    const polygons = byType(view, 'Polygon');
    const incompleteFills = polygons.filter((p) => p.props.fillColor === 'rgba(128,128,128,0.25)');
    expect(incompleteFills).toHaveLength(2);
    incompleteFills.forEach((p) => expect(p.props.strokeWidth).toBe(0));
    expect(polygons.filter((p) => p.props.fillColor === 'rgba(255,165,0,0.2)')).toHaveLength(1);

    const outlines = byType(view, 'Polyline');
    expect(outlines).toHaveLength(2);
    outlines.forEach((line) => {
      expect(line.props.lineDashPattern).toEqual([8, 6]);
      // 枠を閉じる（最初の頂点に戻る）
      expect(line.props.coordinates).toHaveLength(coords.length + 1);
      expect(line.props.coordinates[coords.length]).toEqual(coords[0]);
    });
  });
});
