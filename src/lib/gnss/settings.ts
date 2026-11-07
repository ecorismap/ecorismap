import * as Keychain from 'react-native-keychain';
import { ExternalGnssSettingsType } from '../../types';

export const DEFAULT_EXTERNAL_GNSS_SETTINGS: ExternalGnssSettingsType = {
  // u-blox F9Pの既定。USB直結（CDC-ACM）では値に関係なく通信できる
  baudRate: 38400,
  antennaHeight: 0,
  ntrip: {
    enabled: false,
    host: '',
    port: 2101,
    mountpoint: '',
    username: '',
    version: 'v1',
    sendGga: true,
    ggaIntervalSec: 10,
  },
};

const NTRIP_PASSWORD_SERVICE = 'ecorismap.ntrip';

export const saveNtripPassword = async (password: string): Promise<void> => {
  if (password === '') {
    await Keychain.resetGenericPassword({ service: NTRIP_PASSWORD_SERVICE });
    return;
  }
  await Keychain.setGenericPassword('ntrip', password, { service: NTRIP_PASSWORD_SERVICE });
};

export const loadNtripPassword = async (): Promise<string> => {
  try {
    const credentials = await Keychain.getGenericPassword({ service: NTRIP_PASSWORD_SERVICE });
    return credentials === false ? '' : credentials.password;
  } catch (e) {
    console.log('[loadNtripPassword] error', e);
    return '';
  }
};
