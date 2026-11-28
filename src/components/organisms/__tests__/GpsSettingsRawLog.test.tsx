import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { GpsSettingsRawLog } from '../GpsSettingsRawLog';
import { GpsSettingsContext } from '../../../contexts/GpsSettings';
import type { GnssReceiverStatus, RawLogStatus } from '../../../../modules/gnss-receiver/src';
import { DEFAULT_EXTERNAL_GNSS_SETTINGS } from '../../../lib/gnss/settings';
import type { RawLogEntry } from '../../../lib/gnss/rawLog';

jest.mock('react-native-keychain', () => ({}));

type ContextValue = React.ComponentProps<typeof GpsSettingsContext.Provider>['value'];

const STATUS: GnssReceiverStatus = {
  link: 'connected',
  linkName: 'rx',
  linkError: null,
  ntrip: 'off',
  ntripError: null,
  rtcmBytes: 0,
  lastCorrectionAt: 0,
};

const RECORDING: RawLogStatus = {
  state: 'recording',
  error: null,
  baseName: '20261128_090000_rx',
  startedAt: 0,
  roverBytes: 0,
  correctionBytes: 0,
  sawUbx: false,
};

const ENTRY: RawLogEntry = {
  baseName: '20261128_090000_rx',
  files: [{ name: '20261128_090000_rx.ubx', path: '/d/20261128_090000_rx.ubx', size: 2048 }],
  totalBytes: 2048,
  modifiedAt: 0,
  meta: null,
};

const setup = async (status: GnssReceiverStatus, rawLogs: RawLogEntry[] = []) => {
  const handlers = {
    pressStartRawLog: jest.fn(),
    pressStopRawLog: jest.fn(),
    pressShareRawLog: jest.fn(),
    pressDeleteRawLog: jest.fn(),
  };
  const value = {
    ...handlers,
    externalGnss: {
      snapshot: { status, fix: null, lastUsableFix: null },
      settings: DEFAULT_EXTERNAL_GNSS_SETTINGS,
      rawLogs,
      setRawLogCorrections: jest.fn(),
    },
  } as unknown as ContextValue;
  const { unmount } = await render(
    <GpsSettingsContext.Provider value={value}>
      <GpsSettingsRawLog />
    </GpsSettingsContext.Provider>
  );
  return { unmount, handlers };
};

describe('GpsSettingsRawLog', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(60_000);
  });
  afterEach(() => jest.restoreAllMocks());

  it('受信機につながっていれば開始できる', async () => {
    const { handlers } = await setup(STATUS);
    await fireEvent.press(screen.getByTestId('gpssettings-gnss-rawlog-start'));
    expect(handlers.pressStartRawLog).toHaveBeenCalledTimes(1);
  });

  it('受信機につながっていなければ開始ボタンを無効にする', async () => {
    const { handlers } = await setup({ ...STATUS, link: 'disconnected' });
    await fireEvent.press(screen.getByTestId('gpssettings-gnss-rawlog-start'));
    expect(handlers.pressStartRawLog).not.toHaveBeenCalled();
  });

  it('記録中は停止ボタンを出し、30秒たってもデータが来なければ知らせる', async () => {
    const { handlers } = await setup({ ...STATUS, rawLog: RECORDING });
    await fireEvent.press(screen.getByTestId('gpssettings-gnss-rawlog-stop'));
    expect(handlers.pressStopRawLog).toHaveBeenCalledTimes(1);
    expect(screen.getByText('GpsSettings.externalGnss.rawLog.noData')).toBeTruthy();
  });

  it('データは来ているがUBXが無ければ、受信機の設定を確かめるよう知らせる', async () => {
    await setup({ ...STATUS, rawLog: { ...RECORDING, roverBytes: 5000 } });
    expect(screen.getByText('GpsSettings.externalGnss.rawLog.noUbx')).toBeTruthy();
  });

  it('記録中のファイルは共有・削除できず、終わったファイルはできる', async () => {
    const recording = await setup({ ...STATUS, rawLog: RECORDING }, [ENTRY]);
    await fireEvent.press(screen.getByTestId('gpssettings-gnss-rawlog-delete-0'));
    expect(recording.handlers.pressDeleteRawLog).not.toHaveBeenCalled();
    await recording.unmount();

    const done = await setup(STATUS, [ENTRY]);
    await fireEvent.press(screen.getByTestId('gpssettings-gnss-rawlog-share-0'));
    expect(done.handlers.pressShareRawLog).toHaveBeenCalledWith(ENTRY);
  });
});
