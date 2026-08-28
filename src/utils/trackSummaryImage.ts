import { TrackStatistics, ElevationProfilePoint } from './trackStatistics';
import { buildElevationChart } from './trackChart';
import { t } from '../i18n/config';
import dayjs from '../i18n/dayjs';

// 軌跡サマリー（統計＋標高グラフ）をSVG画像として書き出す。
// エクスポートしたデータを後から見返すときに、アプリを開かなくても内容が分かるようにする

const WIDTH = 800;
const CHART_HEIGHT = 260;
const CHART_TOP = 175;
const STATS_TOP = 96;
const HEIGHT = CHART_TOP + CHART_HEIGHT + 20;
const CHART_PADDING = { top: 10, right: 20, bottom: 30, left: 60 };

// SVGのテキスト・属性に埋め込めないよう文字をエスケープする
const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const formatDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const statItems = (statistics: TrackStatistics): { label: string; value: string }[] => [
  { label: t('TrackSummary.label.distance'), value: `${statistics.distanceKm.toFixed(2)} km` },
  {
    label: t('TrackSummary.label.duration'),
    value: statistics.durationSeconds !== null ? formatDuration(statistics.durationSeconds) : '--',
  },
  {
    label: t('TrackSummary.label.averageSpeed'),
    value: statistics.averageSpeedKmh !== null ? `${statistics.averageSpeedKmh.toFixed(1)} km/h` : '--',
  },
  {
    label: t('TrackSummary.label.maxSpeed'),
    value: statistics.maxSpeedKmh !== null ? `${statistics.maxSpeedKmh.toFixed(1)} km/h` : '--',
  },
  {
    label: t('TrackSummary.label.ascent'),
    value: statistics.ascent !== null ? `${Math.round(statistics.ascent)} m` : '--',
  },
  {
    label: t('TrackSummary.label.descent'),
    value: statistics.descent !== null ? `${Math.round(statistics.descent)} m` : '--',
  },
  {
    label: t('TrackSummary.label.maxAltitude'),
    value: statistics.maxAltitude !== null ? `${Math.round(statistics.maxAltitude)} m` : '--',
  },
  {
    label: t('TrackSummary.label.minAltitude'),
    value: statistics.minAltitude !== null ? `${Math.round(statistics.minAltitude)} m` : '--',
  },
];

export const generateTrackSummarySVG = (
  trackName: string,
  statistics: TrackStatistics,
  profile: ElevationProfilePoint[]
): string => {
  const parts: string[] = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">`);
  parts.push(`<rect width="${WIDTH}" height="${HEIGHT}" fill="#ffffff"/>`);
  parts.push(
    `<text x="24" y="38" font-family="sans-serif" font-size="22" font-weight="bold" fill="#212121">${escapeXml(
      trackName
    )}</text>`
  );

  if (statistics.startTime !== null && statistics.endTime !== null) {
    const range = `${dayjs(statistics.startTime).format('L HH:mm')} - ${dayjs(statistics.endTime).format('HH:mm')}`;
    parts.push(`<text x="24" y="60" font-family="sans-serif" font-size="13" fill="#757575">${escapeXml(range)}</text>`);
  }

  // 統計は4列×2行のカード風レイアウト
  const items = statItems(statistics);
  const columns = 4;
  const cellWidth = (WIDTH - 48) / columns;
  items.forEach((item, i) => {
    const x = 24 + (i % columns) * cellWidth;
    const y = STATS_TOP + Math.floor(i / columns) * 40;
    parts.push(
      `<text x="${x}" y="${y}" font-family="sans-serif" font-size="11" fill="#757575">${escapeXml(item.label)}</text>`
    );
    parts.push(
      `<text x="${x}" y="${y + 19}" font-family="sans-serif" font-size="16" font-weight="bold" fill="#212121">${escapeXml(
        item.value
      )}</text>`
    );
  });

  const chart = buildElevationChart(profile, WIDTH - 48, CHART_HEIGHT, CHART_PADDING);
  if (chart !== null) {
    parts.push(`<g transform="translate(24, ${CHART_TOP})">`);
    // 目盛り線とラベル
    chart.yTicks.forEach((v) => {
      const y = chart.toY(v);
      parts.push(
        `<line x1="${CHART_PADDING.left}" y1="${y.toFixed(1)}" x2="${(WIDTH - 48 - CHART_PADDING.right).toFixed(
          1
        )}" y2="${y.toFixed(1)}" stroke="#e0e0e0" stroke-width="1"/>`
      );
      parts.push(
        `<text x="${CHART_PADDING.left - 6}" y="${(y + 4).toFixed(
          1
        )}" text-anchor="end" font-family="sans-serif" font-size="11" fill="#757575">${v}</text>`
      );
    });
    chart.xTicks.forEach((v) => {
      const x = chart.toX(v);
      parts.push(
        `<text x="${x.toFixed(1)}" y="${(chart.baseY + 16).toFixed(
          1
        )}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#757575">${v}</text>`
      );
    });
    parts.push(
      `<text x="${((WIDTH - 48) / 2).toFixed(1)}" y="${(chart.baseY + 30).toFixed(
        1
      )}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="#757575">km</text>`
    );
    parts.push(`<path d="${chart.areaPath}" fill="#2196f3" fill-opacity="0.25"/>`);
    parts.push(`<path d="${chart.linePath}" fill="none" stroke="#2196f3" stroke-width="2"/>`);
    parts.push('</g>');
  }

  parts.push('</svg>');
  return parts.join('\n');
};
