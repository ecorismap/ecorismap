import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { ExternalGnssSettingsType } from '../../types';
import { Pressable } from '../atoms/Pressable';

type ReceiverValues = Pick<ExternalGnssSettingsType, 'antennaHeight' | 'baudRate'>;

interface Props {
  visible: boolean;
  values: ReceiverValues;
  pressOK: (values: ReceiverValues) => void;
  pressCancel: () => void;
}

const BAUD_RATES = [9600, 38400, 115200, 230400, 460800];

export const GpsSettingsModalReceiver = React.memo((props: Props) => {
  const { visible, values, pressOK, pressCancel } = props;
  const [antennaHeight, setAntennaHeight] = useState('');
  const [baudRate, setBaudRate] = useState(values.baudRate);

  useEffect(() => {
    if (!visible) return;
    setAntennaHeight(String(values.antennaHeight));
    setBaudRate(values.baudRate);
  }, [visible, values]);

  const pressSave = () => {
    const height = Number(antennaHeight.replace(',', '.'));
    pressOK({ antennaHeight: Number.isFinite(height) && height >= 0 ? height : values.antennaHeight, baudRate });
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
