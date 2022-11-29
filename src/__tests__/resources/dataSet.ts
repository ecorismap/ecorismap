import { FEATURETYPE } from '../../constants/AppConstants';

export const dataSet = [
  { layerId: '0', userId: undefined, displayName: 'none', data: [] },
  { layerId: '1', userId: undefined, displayName: 'none', data: [] },
  {
    layerId: '2',
    userId: '0',
    displayName: 'test',
    data: [
      {
        id: '0',
        visible: true,
        type: FEATURETYPE.LINE,
        redraw: false,
        coords: [{ latitude: 0, longitude: 0 }],
        field: {},
      },
    ],
  },
];
