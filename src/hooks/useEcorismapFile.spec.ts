import { renderHook, act } from '@testing-library/react-hooks';
import { dataSet } from '../__tests__/resources/dataSet';
import { layers } from '../__tests__/resources/layer';
import { maps } from '../__tests__/resources/maps';
import { settings } from '../__tests__/resources/settings';
import { useEcorisMapFile } from './useEcorismapFile';

let mockDispatch = jest.fn();
let mockSelector = jest.fn();

jest.mock('react-redux', () => ({
  useDispatch: () => mockDispatch,
  useSelector: () => mockSelector(),
}));

jest.mock('uuid', () => ({ v4: () => '123456789' }));
jest.mock('i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
  language: ['en'],
  initReactI18next: {
    type: '3rdParty',
    init: () => {},
  },
  use: () => {
    return {
      init: () => {},
    };
  },
  t: (key: string) => key,
}));

describe('useEcorismapFile', () => {
  beforeEach(() => {
    mockDispatch = jest.fn();
    mockSelector = jest
      .fn()
      .mockReturnValueOnce(layers)
      .mockReturnValueOnce(dataSet)
      .mockReturnValueOnce(settings)
      .mockReturnValueOnce(maps);
    jest.mock('react-native/Libraries/Utilities/Platform', () => {
      const Platform = jest.requireActual('react-native/Libraries/Utilities/Platform');
      Platform.OS = 'web';
      return Platform;
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('web環境でecorismapファイルをインポートする', async () => {
    const uri =
      'data:application/octet-stream;base64,UEsDBAoAAAAAAFQUYVb1QfG59w4AAPcOAAAYAAAAMjAyMy0wMy0wMV8xMS0zNC00MC5qc29ueyJkYXRhU2V0IjpbeyJsYXllcklkIjoiMCIsImRhdGEiOlt7ImlkIjoiMDk2NGM5OTQtMzFmNC00NmI2LWFiZTMtOGNiNDc4ZGNmYTBlIiwiZGlzcGxheU5hbWUiOm51bGwsInZpc2libGUiOnRydWUsInJlZHJhdyI6ZmFsc2UsImNvb3JkcyI6eyJsb25naXR1ZGUiOjEzNC45OTkyNzA0MzkxNDY1MywibGF0aXR1ZGUiOjM1LjAwMDg3ODg1MDA3OTh9LCJjZW50cm9pZCI6eyJsb25naXR1ZGUiOjEzNC45OTkyNzA0MzkxNDY1MywibGF0aXR1ZGUiOjM1LjAwMDg3ODg1MDA3OTh9LCJmaWVsZCI6eyJuYW1lIjoxLCJ0aW1lIjoiMjAyMy0wMy0wMVQxMTozNDoyOSswOTowMCIsImNtdCI6IiIsInBob3RvIjpbXX19XX0seyJsYXllcklkIjoiMSIsImRhdGEiOltdfSx7ImxheWVySWQiOiIyIiwiZGF0YSI6W119XSwibGF5ZXJzIjpbeyJpZCI6IjAiLCJuYW1lIjoi44Od44Kk44Oz44OIIiwidHlwZSI6IlBPSU5UIiwicGVybWlzc2lvbiI6IlBSSVZBVEUiLCJjb2xvclN0eWxlIjp7ImNvbG9yVHlwZSI6IlNJTkdMRSIsInRyYW5zcGFyZW5jeSI6MC4yLCJjb2xvciI6IiNmZjAwMDAiLCJmaWVsZE5hbWUiOiJuYW1lIiwiY3VzdG9tRmllbGRWYWx1ZSI6IiIsImNvbG9yUmFtcCI6IlJBTkRPTSIsImNvbG9yTGlzdCI6W119LCJsYWJlbCI6Im5hbWUiLCJ2aXNpYmxlIjp0cnVlLCJhY3RpdmUiOnRydWUsImZpZWxkIjpbeyJpZCI6IjAtMCIsIm5hbWUiOiJuYW1lIiwiZm9ybWF0IjoiU0VSSUFMIn0seyJpZCI6IjAtMSIsIm5hbWUiOiJ0aW1lIiwiZm9ybWF0IjoiREFURVRJTUUifSx7ImlkIjoiMC0yIiwibmFtZSI6ImNtdCIsImZvcm1hdCI6IlNUUklORyJ9LHsiaWQiOiIwLTMiLCJuYW1lIjoicGhvdG8iLCJmb3JtYXQiOiJQSE9UTyJ9XX0seyJpZCI6IjEiLCJuYW1lIjoi44OI44Op44OD44KvIiwidHlwZSI6IkxJTkUiLCJwZXJtaXNzaW9uIjoiUFJJVkFURSIsImNvbG9yU3R5bGUiOnsiY29sb3JUeXBlIjoiU0lOR0xFIiwidHJhbnNwYXJlbmN5IjowLjIsImNvbG9yIjoiI2ZmMDAwMCIsImZpZWxkTmFtZSI6Im5hbWUiLCJjdXN0b21GaWVsZFZhbHVlIjoiIiwiY29sb3JSYW1wIjoiUkFORE9NIiwiY29sb3JMaXN0IjpbXX0sImxhYmVsIjoibmFtZSIsInZpc2libGUiOnRydWUsImFjdGl2ZSI6dHJ1ZSwiZmllbGQiOlt7ImlkIjoiMS0wIiwibmFtZSI6Im5hbWUiLCJmb3JtYXQiOiJTRVJJQUwifSx7ImlkIjoiMS0xIiwibmFtZSI6InRpbWUiLCJmb3JtYXQiOiJEQVRFVElNRSJ9LHsiaWQiOiIxLTIiLCJuYW1lIjoiY210IiwiZm9ybWF0IjoiU1RSSU5HIn1dfSx7ImlkIjoiMiIsIm5hbWUiOiLjg53jg6rjgrTjg7MiLCJ0eXBlIjoiUE9MWUdPTiIsInBlcm1pc3Npb24iOiJQUklWQVRFIiwiY29sb3JTdHlsZSI6eyJjb2xvclR5cGUiOiJTSU5HTEUiLCJ0cmFuc3BhcmVuY3kiOjAuMiwiY29sb3IiOiIjZmYwMDAwIiwiZmllbGROYW1lIjoibmFtZSIsImN1c3RvbUZpZWxkVmFsdWUiOiIiLCJjb2xvclJhbXAiOiJSQU5ET00iLCJjb2xvckxpc3QiOltdfSwibGFiZWwiOiJuYW1lIiwidmlzaWJsZSI6dHJ1ZSwiYWN0aXZlIjp0cnVlLCJmaWVsZCI6W3siaWQiOiIyLTAiLCJuYW1lIjoibmFtZSIsImZvcm1hdCI6IlNFUklBTCJ9LHsiaWQiOiIyLTEiLCJuYW1lIjoidGltZSIsImZvcm1hdCI6IkRBVEVUSU1FIn0seyJpZCI6IjItMiIsIm5hbWUiOiJjbXQiLCJmb3JtYXQiOiJTVFJJTkcifV19XSwic2V0dGluZ3MiOnsidHV0cmlhbHMiOnsiVEVSTVNfT0ZfVVNFIjp0cnVlLCJQT0lOVFRPT0xfUExPVF9QT0lOVCI6dHJ1ZSwiUE9JTlRUT09MX0FERF9MT0NBVElPTl9QT0lOVCI6dHJ1ZSwiTElORVRPT0xfUExPVF9MSU5FIjp0cnVlLCJMSU5FVE9PTF9GUkVFSEFORF9MSU5FIjp0cnVlLCJQT0xZR09OVE9PTF9QTE9UX1BPTFlHT04iOnRydWUsIlBPTFlHT05UT09MX0ZSRUVIQU5EX1BPTFlHT04iOnRydWUsIlNFTEVDVElPTlRPT0wiOnRydWUsIklORk9UT09MIjp0cnVlLCJMQVlFUlNfQlROX0lNUE9SVCI6dHJ1ZSwiSE9NRV9CVE5fR1BTIjp0cnVlLCJIT01FX0JUTl9UUkFDSyI6dHJ1ZSwiTUFQU19CVE5fT05MSU5FIjp0cnVlLCJNQVBTX0JUTl9PRkZMSU5FIjp0cnVlfSwiaXNTZXR0aW5nUHJvamVjdCI6ZmFsc2UsImlzU3luY2VkIjpmYWxzZSwic2NyZWVuU3RhdGUiOiJjbG9zZWQiLCJpc0VkaXRpbmdSZWNvcmQiOmZhbHNlLCJpc09mZmxpbmUiOmZhbHNlLCJ1cGRhdGVkQXQiOiIxOTk5LTEyLTMxVDE1OjAwOjAwLjAwMFoiLCJtYXBUeXBlIjoic3RhbmRhcmQiLCJ0aWxlUmVnaW9ucyI6W10sIm1hcFJlZ2lvbiI6eyJsb25naXR1ZGUiOjEzNSwibGF0aXR1ZGUiOjM1LCJ6b29tIjoxNSwicGl0Y2giOjAsImJlYXJpbmciOjAsInBhZGRpbmciOnsidG9wIjowLCJib3R0b20iOjAsImxlZnQiOjAsInJpZ2h0IjowfSwibGF0aXR1ZGVEZWx0YSI6MC4wMTM4ODU5MDU4MDgzNTExNCwibG9uZ2l0dWRlRGVsdGEiOjAuMDE4OTI1NjY2ODA5NTkzNjIyfSwicHJvamVjdFJlZ2lvbiI6eyJsYXRpdHVkZSI6MzUsImxvbmdpdHVkZSI6MTM1LCJsYXRpdHVkZURlbHRhIjowLjAwOTIyLCJsb25naXR1ZGVEZWx0YSI6MC4wMDkyMiwiem9vbSI6MTV9LCJtZW1iZXJMb2NhdGlvbiI6W10sInBsdWdpbnMiOnt9LCJwaG90b3NUb0JlRGVsZXRlZCI6W10sIm1hcExpc3RVUkwiOiJodHRwczovL2RvY3MuZ29vZ2xlLmNvbS9zcHJlYWRzaGVldHMvZC9lLzJQQUNYLTF2Uk1yZFZZUlh3Qlk0OHd2b3JiOFg3bUJHOGx4MmNkRmVSVk16eExxbGtHYmVwMkd6UjBEMjJUaTRrMFhiWGVFXzlUOFRZbGlkUjVmUkR0L3B1Yj9naWQ9MCZzaW5nbGU9dHJ1ZSZvdXRwdXQ9Y3N2IiwibWFwTGlzdCI6W119LCJtYXBzIjpbeyJpZCI6ImhpbGxzaGFkZW1hcCIsIm5hbWUiOiLpmbDlvbHotbfkvI/lm7MiLCJ1cmwiOiJodHRwczovL2N5YmVyamFwYW5kYXRhLmdzaS5nby5qcC94eXovaGlsbHNoYWRlbWFwL3t6fS97eH0ve3l9LnBuZyIsImF0dHJpYnV0aW9uIjoi5Zu95Zyf5Zyw55CG6ZmiIiwibWFwdHlwZSI6Im5vbmUiLCJ2aXNpYmxlIjp0cnVlLCJ0cmFuc3BhcmVuY3kiOjAuNywib3Zlcnpvb21UaHJlc2hvbGQiOjE2LCJoaWdoUmVzb2x1dGlvbkVuYWJsZWQiOmZhbHNlLCJtaW5pbXVtWiI6MCwibWF4aW11bVoiOjE3LCJmbGlwWSI6ZmFsc2V9LHsiaWQiOiJzdGQiLCJuYW1lIjoi5Zyw55CG6Zmi5Zyw5ZuzIiwidXJsIjoiaHR0cHM6Ly9jeWJlcmphcGFuZGF0YS5nc2kuZ28uanAveHl6L3N0ZC97en0ve3h9L3t5fS5wbmciLCJhdHRyaWJ1dGlvbiI6IuWbveWcn+WcsOeQhumZoiIsIm1hcHR5cGUiOiJub25lIiwidmlzaWJsZSI6dHJ1ZSwidHJhbnNwYXJlbmN5IjowLCJvdmVyem9vbVRocmVzaG9sZCI6MTgsImhpZ2hSZXNvbHV0aW9uRW5hYmxlZCI6dHJ1ZSwibWluaW11bVoiOjAsIm1heGltdW1aIjoyMiwiZmxpcFkiOmZhbHNlfSx7ImlkIjoiaHlicmlkIiwibmFtZSI6Iuihm+aYn+eUu+WDjyIsInVybCI6IiIsImF0dHJpYnV0aW9uIjoiR29vZ2xlIiwibWFwdHlwZSI6Imh5YnJpZCIsInZpc2libGUiOmZhbHNlLCJ0cmFuc3BhcmVuY3kiOjAsIm92ZXJ6b29tVGhyZXNob2xkIjoyMiwiaGlnaFJlc29sdXRpb25FbmFibGVkIjpmYWxzZSwibWluaW11bVoiOjAsIm1heGltdW1aIjoyMiwiZmxpcFkiOmZhbHNlfSx7ImlkIjoic3RhbmRhcmQiLCJuYW1lIjoi5qiZ5rqW5Zyw5ZuzIiwidXJsIjoiIiwiYXR0cmlidXRpb24iOiJHb29nbGUiLCJtYXB0eXBlIjoic3RhbmRhcmQiLCJ2aXNpYmxlIjp0cnVlLCJ0cmFuc3BhcmVuY3kiOjAsIm92ZXJ6b29tVGhyZXNob2xkIjoyMiwiaGlnaFJlc29sdXRpb25FbmFibGVkIjpmYWxzZSwibWluaW11bVoiOjAsIm1heGltdW1aIjoyMiwiZmxpcFkiOmZhbHNlfV19UEsBAhQACgAAAAAAVBRhVvVB8bn3DgAA9w4AABgAAAAAAAAAAAAAAAAAAAAAADIwMjMtMDMtMDFfMTEtMzQtNDAuanNvblBLBQYAAAAAAQABAEYAAAAtDwAAAAA=';
    const { result, waitForNextUpdate } = renderHook(() => useEcorisMapFile());
    let ret;
    act(async () => {
      ret = await result.current.openEcorisMapFile(uri);
    });
    expect(result.current.isLoading).toBe(true);
    await waitForNextUpdate();
    expect(result.current.isLoading).toStrictEqual(false);
    expect(mockDispatch).toHaveBeenCalledTimes(4);
    expect(ret).toStrictEqual({ isOK: true, message: '' });
    expect(mockDispatch.mock.calls[0][0]).toEqual({
      type: 'dataSet/setDataSet',
      value: [
        {
          data: [
            {
              centroid: { latitude: 35.0008788500798, longitude: 134.99927043914653 },
              coords: { latitude: 35.0008788500798, longitude: 134.99927043914653 },
              displayName: null,
              field: { cmt: '', name: 1, photo: [], time: '2023-03-01T11:34:29+09:00' },
              id: '0964c994-31f4-46b6-abe3-8cb478dcfa0e',
              redraw: false,
              visible: true,
            },
          ],
          layerId: '0',
        },
        { data: [], layerId: '1' },
        { data: [], layerId: '2' },
      ],
    });
  });

  test('データ保存ボタンを押すと設定とデータがecorismapデータに変換される', () => {
    const { result } = renderHook(() => useEcorisMapFile());

    let ret;
    act(() => {
      ret = result.current.generateEcorisMapData(true);
    });
    expect(ret).not.toStrictEqual('');
  });

  test('データをクリアボタンを押すと設定とデータがクリアされる', () => {
    const { result } = renderHook(() => useEcorisMapFile());

    act(() => {
      result.current.clearEcorisMap();
    });
    expect(mockDispatch).toHaveBeenCalledTimes(4);
  });
});
