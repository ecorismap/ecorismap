import reducer, {
  addRecordsAction,
  deleteDataAction,
  deleteRecordsAction,
  setDataSetAction,
  setRecordSetAction,
  updateDataAction,
  updateTrackFieldAction,
  updateRecordsAction,
  addDataAction,
} from '../dataSet';
import { DataType } from '../../types';
describe('modules/dataSet', () => {
  const state: DataType[] = [
    { layerId: '0', userId: undefined, data: [] },
    { layerId: '1', userId: undefined, data: [] },
    {
      layerId: '2',
      userId: '0',
      data: [
        {
          id: '0',
          userId: '34-56',
          displayName: 'user1',
          visible: true,
          redraw: false,
          coords: [{ latitude: 0, longitude: 0 }],
          field: {},
        },
      ],
    },
  ];

  const state0: DataType[] = [];

  test('should set the dataSet to state', () => {
    const dataSet: DataType[] = [{ layerId: '0', userId: undefined, data: [] }];
    const action = setDataSetAction(dataSet);
    expect(reducer(state, action)).toEqual(dataSet);
  });

  test('should add the data to state', () => {
    const data: DataType[] = [{ layerId: '3', userId: '34-56', data: [] }];
    const action = addDataAction(data);
    expect(reducer(state, action)).toEqual([
      { data: [], layerId: '0', userId: undefined },
      { data: [], layerId: '1', userId: undefined },
      {
        data: [
          {
            coords: [{ latitude: 0, longitude: 0 }],
            displayName: 'user1',
            field: {},
            id: '0',
            redraw: false,
            userId: '34-56',
            visible: true,
          },
        ],
        layerId: '2',
        userId: '0',
      },
      { data: [], layerId: '3', userId: '34-56' },
    ]);
  });

  test('should update the data to state', () => {
    const data: DataType[] = [{ layerId: '2', userId: '0', data: [] }];
    const action = updateDataAction(data);
    expect(reducer(state, action)).toEqual([
      { layerId: '0', userId: undefined, data: [] },
      { layerId: '1', userId: undefined, data: [] },
      { layerId: '2', userId: '0', data: [] },
    ]);
  });

  test('should add the data to state by update if no dataSet', () => {
    const data: DataType[] = [{ layerId: '2', userId: '0', data: [] }];
    const action = updateDataAction(data);
    expect(reducer(state0, action)).toEqual([{ layerId: '2', userId: '0', data: [] }]);
  });

  test('should delete the data from state', () => {
    const data: DataType[] = [
      { layerId: '0', userId: undefined, data: [] },
      { layerId: '1', userId: undefined, data: [] },
    ];
    const action = deleteDataAction(data);
    expect(reducer(state, action)).toEqual([
      {
        data: [
          {
            coords: [{ latitude: 0, longitude: 0 }],
            displayName: 'user1',
            field: {},
            id: '0',
            redraw: false,
            userId: '34-56',
            visible: true,
          },
        ],
        layerId: '2',
        userId: '0',
      },
    ]);
  });
  test('should set the record to state', () => {
    const data: DataType = {
      layerId: '2',
      userId: '0',
      data: [],
    };
    const action = setRecordSetAction(data);
    expect(reducer(state, action)).toEqual([
      { layerId: '0', userId: undefined, data: [] },
      { layerId: '1', userId: undefined, data: [] },
      { layerId: '2', userId: '0', data: [] },
    ]);
  });

  test('should add the record to state', () => {
    const data: DataType = {
      layerId: '2',
      userId: '0',
      data: [
        {
          id: '1',
          userId: '0',
          displayName: 'test',
          visible: true,
          redraw: false,
          coords: [{ latitude: 0, longitude: 0 }],
          field: {},
        },
      ],
    };
    const action = addRecordsAction(data);
    expect(reducer(state, action)).toEqual([
      { layerId: '0', userId: undefined, data: [] },
      { layerId: '1', userId: undefined, data: [] },
      {
        layerId: '2',
        userId: '0',
        data: [
          {
            id: '0',
            userId: '34-56',
            displayName: 'user1',
            visible: true,
            redraw: false,
            coords: [{ latitude: 0, longitude: 0 }],
            field: {},
          },
          {
            id: '1',
            userId: '0',
            displayName: 'test',
            visible: true,
            redraw: false,
            coords: [{ latitude: 0, longitude: 0 }],
            field: {},
          },
        ],
      },
    ]);
  });

  test('should update the record to state', () => {
    const data: DataType = {
      layerId: '2',
      userId: '0',
      data: [
        {
          id: '0',
          userId: '0',
          displayName: 'test',
          visible: false,
          redraw: false,
          coords: { latitude: 0, longitude: 0 },
          field: {},
        },
      ],
    };
    const action = updateRecordsAction(data);
    expect(reducer(state, action)).toEqual([
      { layerId: '0', userId: undefined, data: [] },
      { layerId: '1', userId: undefined, data: [] },
      {
        layerId: '2',
        userId: '0',
        data: [
          {
            id: '0',
            userId: '0',
            displayName: 'test',
            visible: false,
            redraw: false,
            coords: { latitude: 0, longitude: 0 },
            field: {},
          },
        ],
      },
    ]);
  });

  test('should delete the record from state', () => {
    const data: DataType = {
      layerId: '2',
      userId: '0',
      data: [
        {
          id: '0',
          userId: '34-56',
          displayName: 'user1',
          visible: true,
          redraw: false,
          coords: [{ latitude: 0, longitude: 0 }],
          field: {},
        },
      ],
    };
    const action = deleteRecordsAction(data);
    expect(reducer(state, action)).toEqual([
      { layerId: '0', userId: undefined, data: [] },
      { layerId: '1', userId: undefined, data: [] },
      {
        layerId: '2',
        userId: '0',
        data: [],
      },
    ]);
  });

  test('should update the field at state', () => {
    const data = {
      layerId: '2',
      userId: '0',
      dataId: '0',
      coords: [
        { latitude: 0, longitude: 0 },
        { latitude: 1, longitude: 1 },
      ],
      field: { cmt: '1km' },
    };

    const action = updateTrackFieldAction(data);
    expect(reducer(state, action)).toEqual([
      { layerId: '0', userId: undefined, data: [] },
      { layerId: '1', userId: undefined, data: [] },
      {
        layerId: '2',
        userId: '0',
        data: [
          {
            id: '0',
            userId: '34-56',
            displayName: 'user1',
            visible: true,
            redraw: false,
            coords: [
              { latitude: 0, longitude: 0 },
              { latitude: 1, longitude: 1 },
            ],
            field: { cmt: '1km' },
          },
        ],
      },
    ]);
  });
});
