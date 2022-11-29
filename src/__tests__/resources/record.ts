import { FEATURETYPE } from '../../constants/AppConstants';
import { RecordType } from '../../types';

export const record: RecordType[] = [
  {
    centroid: { latitude: 42.4984620698, longitude: 139.8529901728 },
    coords: [
      { latitude: 42.498248918, longitude: 139.8534992896 },
      { latitude: 42.4982588924, longitude: 139.853411112 },
      { latitude: 42.4982816912, longitude: 139.8532861378 },
      { latitude: 42.4983156379, longitude: 139.853064185 },
      { latitude: 42.4984620698, longitude: 139.8529901728 },
    ],
    field: { cmt: '', name: 'mizutani', time: '' },
    id: '1234',
    type: 'LINE',
    visible: true,
    redraw: false,
  },
];
export const recordExt = [
  {
    coords: { latitude: 38.24715800176878, longitude: 140.71658064854364 },
    field: { name: 'St.1' },
    id: '1234',
    type: FEATURETYPE.POINT,
    visible: true,
    userId: '0',
    displayName: 'mizutani',
    checked: false,
    redraw: false,
  },
  {
    coords: { latitude: 38.24101016421964, longitude: 140.71548306286388 },
    field: { name: 'St.3' },
    id: '1234',
    type: FEATURETYPE.POINT,
    visible: true,
    userId: '1',
    displayName: 'takayuki',
    checked: false,
    redraw: false,
  },
];
