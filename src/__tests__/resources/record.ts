import { RecordType } from '../../types';

export const line_record: RecordType[] = [
  {
    centroid: { latitude: 42.4984620698, longitude: 139.8529901728 },
    coords: [
      { latitude: 42.498248918, longitude: 139.8534992896, ele: 100, timestamp: 1612225718000 },
      { latitude: 42.4982588924, longitude: 139.853411112, ele: undefined, timestamp: undefined },
      { latitude: 42.4982816912, longitude: 139.8532861378 },
      { latitude: 42.4983156379, longitude: 139.853064185 },
      { latitude: 42.4984620698, longitude: 139.8529901728 },
    ],
    field: { cmt: '', name: 'mizutani', time: '' },
    id: '1234',
    userId: '0',
    displayName: 'mizutani',
    visible: true,
    redraw: false,
  },
];

export const expectedLineGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="ecoris" version="1.1">
  <trk>
    <name>mizutani</name>
    <time></time>
    <cmt></cmt>
    <trkseg>
      <trkpt lat="42.498248918" lon="139.8534992896">
        <time>2021-02-02T00:28:38.000Z</time>
        <ele>100</ele>
      </trkpt>
      <trkpt lat="42.4982588924" lon="139.853411112"></trkpt>
      <trkpt lat="42.4982816912" lon="139.8532861378"></trkpt>
      <trkpt lat="42.4983156379" lon="139.853064185"></trkpt>
      <trkpt lat="42.4984620698" lon="139.8529901728"></trkpt>
    </trkseg>
  </trk>
</gpx>`;

export const point_record: RecordType[] = [
  {
    coords: { latitude: 38.24715800176878, longitude: 140.71658064854364, ele: 100 },
    field: { name: 'St.1', time: '2020-01-01T09:28:38+09:00' },
    id: '1234',
    visible: true,
    userId: '0',
    displayName: 'mizutani',
    redraw: false,
  },
  {
    coords: { latitude: 38.24101016421964, longitude: 140.71548306286388, ele: undefined },
    field: { name: 'St.3', time: '5時' },
    id: '1234',
    visible: true,
    userId: '1',
    displayName: null,
    redraw: false,
  },
];

export const expectedPointGpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="ecoris" version="1.1">
  <wpt lat="38.24715800176878" lon="140.71658064854364">
    <name>St.1</name>
    <time>2020-01-01T00:28:38.000Z</time>
    <ele>100</ele>
    <cmt></cmt>
  </wpt>
  <wpt lat="38.24101016421964" lon="140.71548306286388">
    <name>St.3</name>
    <time></time>
    <cmt></cmt>
  </wpt>
</gpx>`;
