import Dexie from 'dexie';

export const db = new Dexie('tilesDB');
db.version(1).stores({
  geotiff: 'mapId, blob, boundary',
});
