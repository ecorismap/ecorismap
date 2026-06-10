import reducer, {
  addRecordsAction,
  deleteDataAction,
  deleteRecordsAction,
  setDataSetAction,
  setRecordSetAction,
  updateDataAction,
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

  test('should keep order: updated records stay in place, new records appended', () => {
    const baseState: DataType[] = [
      {
        layerId: '2',
        userId: '0',
        data: [
          { id: '0', userId: '0', displayName: 'u', visible: true, redraw: false, field: {}, coords: undefined },
          { id: '1', userId: '0', displayName: 'u', visible: true, redraw: false, field: {}, coords: undefined },
          { id: '2', userId: '0', displayName: 'u', visible: true, redraw: false, field: {}, coords: undefined },
        ],
      },
    ];
    const data: DataType = {
      layerId: '2',
      userId: '0',
      data: [
        { id: '1', userId: '0', displayName: 'updated', visible: false, redraw: false, field: {}, coords: undefined },
        { id: '9', userId: '0', displayName: 'new', visible: true, redraw: false, field: {}, coords: undefined },
      ],
    };
    const action = updateRecordsAction(data);
    const result = reducer(baseState, action);
    expect(result[0].data.map((d) => d.id)).toEqual(['0', '1', '2', '9']);
    expect(result[0].data[1].displayName).toBe('updated');
  });

  test('should logically delete uploaded records and physically delete unsynced records', () => {
    const baseState: DataType[] = [
      {
        layerId: '2',
        userId: '0',
        data: [
          { id: '0', userId: '0', displayName: 'u', visible: true, redraw: false, field: {}, coords: undefined, uploaded: true },
          { id: '1', userId: '0', displayName: 'u', visible: true, redraw: false, field: {}, coords: undefined },
          { id: '2', userId: '0', displayName: 'u', visible: true, redraw: false, field: {}, coords: undefined },
        ],
      },
    ];
    const data: DataType = {
      layerId: '2',
      userId: '0',
      data: [
        { id: '0', userId: '0', displayName: 'u', visible: true, redraw: false, field: {}, coords: undefined, uploaded: true },
        { id: '1', userId: '0', displayName: 'u', visible: true, redraw: false, field: {}, coords: undefined },
      ],
    };
    const action = deleteRecordsAction(data);
    const result = reducer(baseState, action);
    expect(result[0].data.map((d) => d.id)).toEqual(['0', '2']);
    expect(result[0].data[0]).toEqual(expect.objectContaining({ id: '0', deleted: true }));
    expect(result[0].data[1].deleted).toBeUndefined();
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
});
