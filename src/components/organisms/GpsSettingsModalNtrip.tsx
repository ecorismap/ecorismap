import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { NtripMountpoint } from '../../lib/gnss/sourceTable';
import { NtripSettingsType } from '../../types';
import { Pressable } from '../atoms/Pressable';

interface Props {
  visible: boolean;
  ntrip: NtripSettingsType;
  password: string;
  pressOK: (ntrip: NtripSettingsType, password: string) => void;
  pressCancel: () => void;
  fetchMountpoints: (ntrip: NtripSettingsType, password: string) => Promise<NtripMountpoint[]>;
}

const toPort = (text: string, fallback: number) => {
  const n = parseInt(text, 10);
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : fallback;
};

export const GpsSettingsModalNtrip = React.memo((props: Props) => {
  const { visible, ntrip, password, pressOK, pressCancel, fetchMountpoints } = props;
  const [host, setHost] = useState('');
  const [port, setPort] = useState('');
  const [mountpoint, setMountpoint] = useState('');
  const [username, setUsername] = useState('');
  const [pass, setPass] = useState('');
  const [version, setVersion] = useState<NtripSettingsType['version']>('v1');
  const [sendGga, setSendGga] = useState(true);
  const [ggaInterval, setGgaInterval] = useState('');
  const [mountpoints, setMountpoints] = useState<NtripMountpoint[] | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setHost(ntrip.host);
    setPort(String(ntrip.port));
    setMountpoint(ntrip.mountpoint);
    setUsername(ntrip.username);
    setPass(password);
    setVersion(ntrip.version);
    setSendGga(ntrip.sendGga);
    setGgaInterval(String(ntrip.ggaIntervalSec));
    setMountpoints(null);
    setFetchError('');
  }, [visible, ntrip, password]);

  const fetchDisabled = fetching || host.trim() === '';

  const current = (): NtripSettingsType => ({
    enabled: ntrip.enabled,
    host: host.trim(),
    port: toPort(port, 2101),
    mountpoint: mountpoint.trim(),
    username: username.trim(),
    version,
    sendGga,
    ggaIntervalSec: Math.max(1, toPort(ggaInterval, 10)),
  });

  const pressFetch = async () => {
    setFetching(true);
    setFetchError('');
    try {
      setMountpoints(await fetchMountpoints(current(), pass));
    } catch (e) {
      setMountpoints(null);
      setFetchError(
        t('GpsSettings.externalGnss.ntrip.fetchFailed', { message: e instanceof Error ? e.message : String(e) })
      );
    } finally {
      setFetching(false);
    }
  };

  const selectMountpoint = (m: NtripMountpoint) => {
    setMountpoint(m.mountpoint);
    // ソーステーブルがGGA必須と言っていればそれに合わせる
    setSendGga(m.requiresGga);
    setMountpoints(null);
  };

  return (
    <Modal animationType="none" transparent={true} visible={visible} onRequestClose={pressCancel}>
      <View style={styles.centeredView}>
        <View style={styles.frame}>
          <Text style={styles.title}>{`${t('GpsSettings.externalGnss.ntrip.title')}`}</Text>
          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>{`${t('GpsSettings.externalGnss.ntrip.host')}`}</Text>
            <TextInput
              style={styles.input}
              value={host}
              onChangeText={setHost}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Text style={styles.label}>{`${t('GpsSettings.externalGnss.ntrip.port')}`}</Text>
            <TextInput style={styles.input} value={port} onChangeText={setPort} keyboardType="number-pad" />
            <Text style={styles.label}>{`${t('GpsSettings.externalGnss.ntrip.username')}`}</Text>
            <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.label}>{`${t('GpsSettings.externalGnss.ntrip.password')}`}</Text>
            <TextInput
              style={styles.input}
              value={pass}
              onChangeText={setPass}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={styles.label}>{`${t('GpsSettings.externalGnss.ntrip.mountpoint')}`}</Text>
            <View style={styles.row}>
              <TextInput
                style={[styles.input, styles.flex]}
                value={mountpoint}
                onChangeText={setMountpoint}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                style={[styles.smallButton, fetchDisabled && styles.smallButtonDisabled]}
                onPress={pressFetch}
                disabled={fetchDisabled}
              >
                {fetching ? (
                  <ActivityIndicator size="small" color={COLOR.GRAY4} />
                ) : (
                  <Text style={[styles.smallButtonText, fetchDisabled && styles.smallButtonTextDisabled]}>
                    {`${t('GpsSettings.externalGnss.ntrip.fetchMountpoints')}`}
                  </Text>
                )}
              </Pressable>
            </View>
            {fetchError !== '' && <Text style={styles.error}>{fetchError}</Text>}
            {mountpoints !== null && (
              <View style={styles.mountList}>
                {mountpoints.length === 0 ? (
                  <Text style={styles.note}>{`${t('GpsSettings.externalGnss.ntrip.noMountpoints')}`}</Text>
                ) : (
                  mountpoints.map((m) => (
                    <Pressable key={m.mountpoint} style={styles.mountItem} onPress={() => selectMountpoint(m)}>
                      <Text style={styles.mountName}>{m.mountpoint}</Text>
                      <Text style={styles.note}>
                        {[m.identifier, m.format, m.navSystem, m.requiresGga ? 'GGA' : ''].filter(Boolean).join(' / ')}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
            )}
            <Text style={styles.label}>{`${t('GpsSettings.externalGnss.ntrip.version')}`}</Text>
            <View style={styles.row}>
              {(['v1', 'v2'] as const).map((v) => (
                <Pressable
                  key={v}
                  style={[styles.segment, version === v && styles.segmentSelected]}
                  onPress={() => setVersion(v)}
                >
                  <Text style={version === v ? styles.segmentTextSelected : undefined}>{`NTRIP ${v}`}</Text>
                </Pressable>
              ))}
            </View>
            <View style={[styles.row, styles.switchRow]}>
              <View style={styles.flex}>
                <Text>{`${t('GpsSettings.externalGnss.ntrip.sendGga')}`}</Text>
                <Text style={styles.note}>{`${t('GpsSettings.externalGnss.ntrip.sendGgaNote')}`}</Text>
              </View>
              <Switch value={sendGga} onValueChange={setSendGga} />
            </View>
            {sendGga && (
              <>
                <Text style={styles.label}>{`${t('GpsSettings.externalGnss.ntrip.ggaInterval')}`}</Text>
                <TextInput
                  style={styles.input}
                  value={ggaInterval}
                  onChangeText={setGgaInterval}
                  keyboardType="number-pad"
                />
              </>
            )}
          </ScrollView>
          <View style={styles.buttons}>
            <Pressable style={styles.button} onPress={() => pressOK(current(), pass)}>
              <Text>{`${t('common.ok')}`}</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={pressCancel}>
              <Text>{`${t('common.cancel')}`}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderRadius: 5,
    height: 44,
    justifyContent: 'center',
    width: 100,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 12,
  },
  centeredView: {
    alignItems: 'center',
    backgroundColor: COLOR.ALFAGRAY,
    flex: 1,
    justifyContent: 'center',
  },
  error: {
    color: COLOR.RED,
    fontSize: 12,
    marginTop: 4,
  },
  flex: {
    flex: 1,
  },
  frame: {
    backgroundColor: COLOR.WHITE,
    borderRadius: 16,
    elevation: 5,
    maxHeight: '85%',
    paddingHorizontal: 20,
    paddingVertical: 18,
    width: '90%',
  },
  input: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.GRAY2,
    borderRadius: 5,
    borderWidth: 1,
    fontSize: 15,
    height: 40,
    paddingHorizontal: 10,
  },
  label: {
    color: COLOR.GRAY4,
    fontSize: 12,
    marginBottom: 4,
    marginTop: 10,
  },
  mountItem: {
    borderBottomColor: COLOR.GRAY1,
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  mountList: {
    borderColor: COLOR.GRAY1,
    borderRadius: 5,
    borderWidth: 1,
    marginTop: 6,
    paddingHorizontal: 8,
  },
  mountName: {
    fontSize: 14,
    fontWeight: '600',
  },
  note: {
    color: COLOR.GRAY3,
    fontSize: 11,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  scroll: {
    flexGrow: 0,
  },
  segment: {
    alignItems: 'center',
    borderColor: COLOR.GRAY2,
    borderRadius: 5,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  segmentSelected: {
    backgroundColor: COLOR.BLUE,
    borderColor: COLOR.BLUE,
  },
  segmentTextSelected: {
    color: COLOR.WHITE,
  },
  smallButton: {
    alignItems: 'center',
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.BLUE,
    borderRadius: 5,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    marginLeft: 8,
    paddingHorizontal: 10,
  },
  smallButtonDisabled: {
    backgroundColor: COLOR.GRAY0,
    borderColor: COLOR.GRAY2,
  },
  smallButtonText: {
    color: COLOR.BLUE,
    fontSize: 13,
    fontWeight: '600',
  },
  smallButtonTextDisabled: {
    color: COLOR.GRAY3,
  },
  switchRow: {
    marginTop: 14,
  },
  title: {
    fontSize: 18,
    marginBottom: 6,
    textAlign: 'center',
  },
});
