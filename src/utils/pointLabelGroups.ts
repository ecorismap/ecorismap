// ポイントラベルの配置計算。
// 1. まず全ポイントを通常位置（記号の上／下）に置き、画面上で重なるものは後勝ちで外す
// 2. 外れたポイントは、ズームが十分なら記号の周囲（右・左・斜め・上下、半径2段階）に
//    空きを探し、見つかればそこへ置いて記号から引き出し線を描く
// 3. それでも置けなければラベルを消す（記号は残す）
// 記号が重なるほど近い（同じ地点とみなす）ポイント同士は、引き出し線が使えるズームでは
// 先頭も含めて全員を引き出し線にする（通常位置と引き出し線が混ざると対応が分かりにくい）。
// ラベルは他ポイントの記号にも重ねない。残す順は priorityIds（選択中など）→入力順。
// 地図のズーム（端数込み）と緯度からWebメルカトルのピクセル座標に投影して判定する。

export interface LabeledPoint {
  id: string;
  coords: { latitude: number; longitude: number } | undefined;
  label: string;
}

export interface LabelLayoutOptions {
  /** ズームのタイルサイズ。Google Maps系は256、maplibreは512 */
  tileSize: number;
  /** 通常位置がポイントの上か下か */
  labelPosition: 'above' | 'below';
  fontSize: number;
  lineHeight: number;
  /** PointLabelの改行幅（文字数）。省略時は改行しない */
  maxCharsPerLine?: number;
  /** ラベル幅の上限[px]。超える分は描画側で…に省略されるので、推定もここで打ち切る */
  maxLabelWidth?: number;
  /** ポイント記号の直径[px] */
  pointSize: number;
  /** この幅以内なら重なり扱いにする余白[px] */
  margin: number;
  /** 引き出し線を使う最小ズーム（256pxタイル基準。maplibreのズームは+1して比較）。これ未満は間引きだけ */
  leaderMinZoom: number;
  /** 引き出し線の長さ候補[px]（記号中心からラベルの付け根まで） */
  leaderRadii: number[];
  /** ラベルを優先して残すポイントのid（選択中など） */
  priorityIds?: string[];
}

export const DEFAULT_LABEL_LAYOUT_OPTIONS: LabelLayoutOptions = {
  tileSize: 256,
  labelPosition: 'above',
  fontSize: 15,
  lineHeight: 18,
  pointSize: 15,
  margin: 2,
  leaderMinZoom: 15,
  leaderRadii: [26, 46],
};

/** ラベルの置き場所。dx,dyはラベル矩形の中心の、記号中心からのずれ[px]（yは下が正） */
export interface LabelPlacement {
  dx: number;
  dy: number;
  width: number;
  height: number;
  /** 引き出し線。記号の縁からラベルの付け根まで。angleはラジアン（画面座標、yは下が正） */
  leader?: { angle: number; length: number };
}

interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const isFullWidth = (ch: string) => (ch.codePointAt(0) ?? 0) > 0xff;

/** PointLabelの改行規則に合わせたラベル矩形の推定サイズ[px] */
export const estimateLabelSize = (
  label: string,
  options: Pick<LabelLayoutOptions, 'fontSize' | 'lineHeight' | 'maxCharsPerLine' | 'maxLabelWidth'>
): { width: number; height: number } => {
  if (label.length === 0) return { width: 0, height: 0 };
  const perLine = options.maxCharsPerLine || label.length;
  let width = 0;
  let lines = 0;
  for (let i = 0; i < label.length; i += perLine) {
    const line = label.slice(i, i + perLine);
    let lineWidth = 0;
    for (const ch of line) lineWidth += isFullWidth(ch) ? options.fontSize : options.fontSize * 0.6;
    width = Math.max(width, lineWidth);
    lines += 1;
  }
  if (options.maxLabelWidth !== undefined) width = Math.min(width, options.maxLabelWidth);
  return { width, height: lines * options.lineHeight };
};

export const projectToPixel = (
  coords: { latitude: number; longitude: number },
  zoom: number,
  tileSize: number
): { x: number; y: number } => {
  const scale = tileSize * Math.pow(2, zoom);
  const lat = Math.max(-85.05112878, Math.min(85.05112878, coords.latitude));
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const x = ((coords.longitude + 180) / 360) * scale;
  const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale;
  return { x, y };
};

const intersects = (a: Box, b: Box, margin: number) =>
  a.left - margin < b.right && a.right + margin > b.left && a.top - margin < b.bottom && a.bottom + margin > b.top;

/** 矩形が覆うセルすべてに登録して探す障害物グリッド（矩形がセルより大きくても取りこぼさない） */
class ObstacleGrid {
  private cells = new Map<string, { box: Box; owner: string }[]>();
  constructor(private cellSize: number) {}
  private keysOf(box: Box): string[] {
    const keys: string[] = [];
    const x0 = Math.floor(box.left / this.cellSize);
    const x1 = Math.floor(box.right / this.cellSize);
    const y0 = Math.floor(box.top / this.cellSize);
    const y1 = Math.floor(box.bottom / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) keys.push(`${cx}:${cy}`);
    return keys;
  }
  add(box: Box, owner: string) {
    for (const key of this.keysOf(box)) {
      const cell = this.cells.get(key);
      if (cell) cell.push({ box, owner });
      else this.cells.set(key, [{ box, owner }]);
    }
  }
  collides(box: Box, margin: number, ignoreOwner?: string): boolean {
    const grown = { left: box.left - margin, right: box.right + margin, top: box.top - margin, bottom: box.bottom + margin };
    for (const key of this.keysOf(grown)) {
      const cell = this.cells.get(key);
      if (!cell) continue;
      for (const item of cell) {
        if (item.owner === ignoreOwner) continue;
        if (intersects(item.box, box, margin)) return true;
      }
    }
    return false;
  }
}

const boxAt = (cx: number, cy: number, width: number, height: number): Box => ({
  left: cx - width / 2,
  right: cx + width / 2,
  top: cy - height / 2,
  bottom: cy + height / 2,
});

/** 引き出し線の方向候補（右、左、右上、左上、右下、左下、上、下の順に試す） */
const LEADER_DIRECTIONS = [0, Math.PI, -Math.PI / 4, (-3 * Math.PI) / 4, Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 2, Math.PI / 2];

/** 引き出し線の先端（付け根）がラベル矩形の縁に来るようにラベル中心を決める */
const leaderPlacement = (angle: number, radius: number, width: number, height: number, pointSize: number): LabelPlacement => {
  const px = radius * Math.cos(angle);
  const py = radius * Math.sin(angle);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = px + (Math.abs(cos) > 0.3 ? Math.sign(cos) * (width / 2) : 0);
  const dy = py + (Math.abs(sin) > 0.3 ? Math.sign(sin) * (height / 2) : 0);
  return { dx, dy, width, height, leader: { angle, length: radius - pointSize / 2 } };
};

/**
 * ラベルの置き場所を決める。戻り値はラベルを描くポイントのid → 置き場所。
 * ラベルが空・座標のないポイントや、置き場所がなく間引かれたポイントは含まれない。
 */
export const layoutPointLabels = (
  points: LabeledPoint[],
  zoom: number,
  options: Partial<LabelLayoutOptions> = {}
): Map<string, LabelPlacement> => {
  const opts = { ...DEFAULT_LABEL_LAYOUT_OPTIONS, ...options };
  const priority = new Set(opts.priorityIds ?? []);
  const ordered = [...points.filter((p) => priority.has(p.id)), ...points.filter((p) => !priority.has(p.id))];
  const half = opts.pointSize / 2;

  // 記号は全ポイント分を障害物にする（ラベルは自分以外の記号に重ねない）
  const dots = new ObstacleGrid(64);
  const pixel = new Map<string, { x: number; y: number }>();
  for (const point of ordered) {
    if (!point.coords) continue;
    const p = projectToPixel(point.coords, zoom, opts.tileSize);
    pixel.set(point.id, p);
    dots.add(boxAt(p.x, p.y, opts.pointSize, opts.pointSize), point.id);
  }

  // 引き出し線を使えるズームか（256pxタイル基準に揃えて比較）
  const leadersEnabled = zoom + Math.log2(opts.tileSize / 256) >= opts.leaderMinZoom;

  // 記号が重なるほど近いラベル付きポイント同士は、全員を引き出し線にする
  const forceLeader = new Set<string>();
  if (leadersEnabled) {
    const cellSize = opts.pointSize;
    const cells = new Map<string, string[]>();
    const cellKey = (x: number, y: number) => `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
    const labeled = ordered.filter((point) => point.label.length > 0 && pixel.has(point.id));
    for (const point of labeled) {
      const p = pixel.get(point.id)!;
      const key = cellKey(p.x, p.y);
      const cell = cells.get(key);
      if (cell) cell.push(point.id);
      else cells.set(key, [point.id]);
    }
    for (const point of labeled) {
      const p = pixel.get(point.id)!;
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const cell = cells.get(cellKey(p.x + ox * cellSize, p.y + oy * cellSize));
          if (!cell) continue;
          for (const otherId of cell) {
            if (otherId === point.id) continue;
            const q = pixel.get(otherId)!;
            if (Math.hypot(q.x - p.x, q.y - p.y) < opts.pointSize) {
              forceLeader.add(point.id);
              forceLeader.add(otherId);
            }
          }
        }
      }
    }
  }

  const labels = new ObstacleGrid(256);
  const result = new Map<string, LabelPlacement>();
  const canPlace = (id: string, p: { x: number; y: number }, pl: LabelPlacement) => {
    const box = boxAt(p.x + pl.dx, p.y + pl.dy, pl.width, pl.height);
    return !labels.collides(box, opts.margin) && !dots.collides(box, 0, id);
  };
  const place = (id: string, p: { x: number; y: number }, pl: LabelPlacement) => {
    labels.add(boxAt(p.x + pl.dx, p.y + pl.dy, pl.width, pl.height), id);
    result.set(id, pl);
  };

  // 1段目: 通常位置
  const deferred: { id: string; p: { x: number; y: number }; width: number; height: number }[] = [];
  for (const point of ordered) {
    const p = pixel.get(point.id);
    if (!p || point.label.length === 0) continue;
    const { width, height } = estimateLabelSize(point.label, opts);
    if (forceLeader.has(point.id)) {
      deferred.push({ id: point.id, p, width, height });
      continue;
    }
    const dy = opts.labelPosition === 'above' ? -(half + height / 2) : half + height / 2;
    const pl: LabelPlacement = { dx: 0, dy, width, height };
    if (canPlace(point.id, p, pl)) place(point.id, p, pl);
    else deferred.push({ id: point.id, p, width, height });
  }

  // 2段目: 引き出し線
  if (leadersEnabled) {
    for (const item of deferred) {
      for (const radius of opts.leaderRadii) {
        let placed = false;
        for (const angle of LEADER_DIRECTIONS) {
          const pl = leaderPlacement(angle, radius, item.width, item.height, opts.pointSize);
          if (canPlace(item.id, item.p, pl)) {
            place(item.id, item.p, pl);
            placed = true;
            break;
          }
        }
        if (placed) break;
      }
    }
  }
  return result;
};
