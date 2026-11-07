import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { ExternalGnssSettingsType } from '../../types';
import { Pressable } from '../atoms/Pressable';
import {
  DEFAULT_GNSS_TRACK_DISTANCE,
  DEFAULT_GNSS_TRACK_MODE,
  GNSS_TRACK_DISTANCES,
  GnssTrackMode,
} from '../../lib/gnss/trackThinning';

export type ReceiverValues = Pick<
  ExternalGnssSettingsType,
  'antennaHeight' | 'baudRate' | 'trackMode' | 'trackDistance'
>;

interface Props {
  visible: boolean;
  values: ReceiverValues;
  pressOK: (values: ReceiverValues) => void;
  pressCancel: () => void;
}

const BAUD_RATES = [9600, 38400, 115200, 230400, 460800];
const TRACK_MODES: GnssTrackMode[] = ['adaptive', 'distance', 'all'];

export const GpsSettingsModalReceiver = React.memo((props: Props) => {
  const { visible, values, pressOK, pressCancel } = props;
  const [antennaHeight, setAntennaHeight] = useState('');
  const [baudRate, setBaudRate] = useState(values.baudRate);
  const [trackMode, setTrackMode] = useState<GnssTrackMode>(DEFAULT_GNSS_TRACK_MODE);
  const [trackDistance, setTrackDistance] = useState(DEFAULT_GNSS_TRACK_DISTANCE);

  useEffect(() => {
    if (!visible) return;
    setAntennaHeight(String(values.antennaHeight));
    setBaudRate(values.baudRate);
    setTrackMode(values.trackMode ?? DEFAULT_GNSS_TRACK_MODE);
    setTrackDistance(values.trackDistance ?? DEFAULT_GNSS_TRACK_DISTANCE);
  }, [visible, values]);

  const pressSave = () => {
    const height = Number(antennaHeight.replace(',', '.'));
    pressOK({
      antennaHeight: Number.isFinite(height) && height >= 0 ? height : values.antennaHeight,
      baudRate,
      trackMode,
      trackDistance,
    });
  };

  return (
    <Modal animationType="none" transparent={true} visible={visible} onRequestClose={pressCancel}>
      <View style={styles.centeredView}>
        <View style={styles.frame}>
          <Text style={styles.title}>{`${t('GpsSettings.externalGnss.receiverSettings')}`}</Text>
          <Text style={styles.label}>{`${t('GpsSettings.externalGnss.antennaHeight')}`}</Text>
          <TextInput
            style={styles.input}
            value={antennaHeight}
            onChangeText={setAntennaHeight}
            keyboardType="decimal-pad"
          />
          <Text style={styles.note}>{`${t('GpsSettings.externalGnss.antennaHeightNote')}`}</Text>
          <Text style={styles.label}>{`${t('GpsSettings.externalGnss.baudRate')}`}</Text>
          <View style={styles.wrapRow}>
            {BAUD_RATES.map((rate) => (
              <Pressable
                key={rate}
                style={[styles.segment, baudRate === rate && styles.segmentSelected]}
                onPress={() => setBaudRate(rate)}
              >
                <Text style={baudRate === rate ? styles.segmentTextSelected : undefined}>{rate}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>{`${t('GpsSettings.externalGnss.track.title')}`}</Text>
          <View style={styles.wrapRow}>
            {TRACK_MODES.map((mode) => (
              <Pressable
                key={mode}
                style={[styles.segment, trackMode === mode && styles.segmentSelected]}
                onPress={() => setTrackMode(mode)}
              >
                <Text style={trackMode === mode ? styles.segmentTextSelected : undefined}>
                  {`${t(`GpsSettings.externalGnss.track.${mode}`)}`}
                </Text>
              </Pressable>
            ))}
          </View>
          {trackMode === 'distance' && (
            <View style={styles.wrapRow}>
              {GNSS_TRACK_DISTANCES.map((d) => (
                <Pressable
                  key={d}
                  style={[styles.segment, trackDistance === d && styles.segmentSelected]}
                  onPress={() => setTrackDistance(d)}
                >
                  <Text style={trackDistance === d ? styles.segmentTextSelected : undefined}>{`${d}m`}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Text style={styles.note}>{`${t(`GpsSettings.externalGnss.track.${trackMode}Note`)}`}</Text>
          <View style={styles.buttons}>
            <Pressable style={styles.button} onPress={pressSave}>
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
    marginTop: 16,
  },
  centeredView: {
    alignItems: 'center',
    backgroundColor: COLOR.ALFAGRAY,
    flex: 1,
    justifyContent: 'center',
  },
  frame: {
    backgroundColor: COLOR.WHITE,
    borderRadius: 16,
    elevation: 5,
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
  note: {
    color: COLOR.GRAY3,
    fontSize: 11,
    marginTop: 4,
  },
  segment: {
    alignItems: 'center',
    borderColor: COLOR.GRAY2,
    borderRadius: 5,
    borderWidth: 1,
    marginBottom: 8,
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  segmentSelected: {
    backgroundColor: COLOR.BLUE,
    borderColor: COLOR.BLUE,
  },
  segmentTextSelected: {
    color: COLOR.WHITE,
  },
  title: {
    fontSize: 18,
    marginBottom: 6,
    textAlign: 'center',
  },
  wrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
});
