export function tileGridForRegion(
  region: { minLat: number; maxLat: number; minLon: number; maxLon: number },
  minZoom: number,
  maxZoom: number
) {
  let tiles: { x: number; y: number; z: number }[] = [];

  for (let zoom = minZoom; zoom <= maxZoom; zoom++) {
    const subTiles = tilesForZoom(region, zoom);
    tiles = [...tiles, ...subTiles];
  }

  return tiles;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function tileToWebMercator(x: number, y: number, z: number): { mercatorX: number; mercatorY: number } {
  const resolution = (2 * Math.PI * 6378137) / Math.pow(2, z);
  const mercatorX = x * resolution - Math.PI * 6378137;
  const mercatorY = Math.PI * 6378137 - y * resolution;

  return { mercatorX, mercatorY };
}

export function lonToTileX(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

export function latToTileY(lat: number, zoom: number): number {
  return Math.floor(
    ((1 - Math.log(Math.tan(degToRad(lat)) + 1 / Math.cos(degToRad(lat))) / Math.PI) / 2) * Math.pow(2, zoom)
  );
}

export function tilesForZoom(
  region: { minLon: number; maxLon: number; minLat: number; maxLat: number },
  zoom: number
): { x: number; y: number; z: number }[] {
  const { minLon, maxLon, minLat, maxLat } = region;

  const minTileX = lonToTileX(minLon, zoom);
  const maxTileX = lonToTileX(maxLon, zoom);
  const minTileY = latToTileY(maxLat, zoom);
  const maxTileY = latToTileY(minLat, zoom);

  const tiles: { x: number; y: number; z: number }[] = [];
  for (let y = minTileY; y <= maxTileY + 1; y++) {
    for (let x = minTileX; x <= maxTileX + 1; x++) {
      tiles.push({ x, y, z: zoom });
    }
  }

  return tiles;
}

export function getTileRegion(region: { minLon: number; maxLon: number; minLat: number; maxLat: number }, zoom = 15) {
  const { minLon, minLat, maxLon, maxLat } = region;
  const leftTileX = lonToTileX(minLon, zoom);
  const rightTileX = lonToTileX(maxLon, zoom);
  const bottomTileY = latToTileY(minLat, zoom);
  const topTileY = latToTileY(maxLat, zoom);
  return { leftTileX, rightTileX, bottomTileY, topTileY };
}
