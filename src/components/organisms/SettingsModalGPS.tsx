import React, { useEffect, useMemo, useState } from 'react';
import { View, Modal, Text, StyleSheet } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR, GPS_ACCURACY } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';

import { CheckBox } from '../molecules/CheckBox';
import { GpsAccuracyType } from '../../types';

interface Props {
  visible: boolean;
  gpsAccuracy: GpsAccuracyType;
  showMockGPSButton: boolean;
  pressOK: (value: GpsAccuracyType, showMockGPSButton: boolean) => void;
  pressCancel: () => void;
}

export const SettingsModalGPS = React.memo((props: Props) => {
  const { visible, gpsAccuracy, showMockGPSButton, pressOK, pressCancel } = props;
  const gpsAccuracyList = useMemo(() => Object.keys(GPS_ACCURACY), []);
  const gpsAccuracyLabels = useMemo(() => Object.values(GPS_ACCURACY), []);
  const { windowWidth } = useWindow();
  const modalWidthScale = 0.7;

  const [checkedIndex, setCheckedIndex] = useState(0);
  const [mockGPSButtonChecked, setMockGPSButtonChecked] = useState(showMockGPSButton);

  useEffect(() => {
    const newCheckedIndex = gpsAccuracyList.findIndex((v) => v === gpsAccuracy);

    setCheckedIndex(newCheckedIndex === -1 ? 0 : newCheckedIndex);
  }, [gpsAccuracy, gpsAccuracyList]);

  useEffect(() => {
    setMockGPSButtonChecked(showMockGPSButton);
  }, [showMockGPSButton]);

  const styles = StyleSheet.create({
    alert_text: {
      color: COLOR.RED,
      fontSize: 12,
      height: 40,
      lineHeight: 40,
      marginLeft: 3,
      paddingHorizontal: 5,
      verticalAlign: 'middle',
      textAlignVertical: 'center',
    },

    checkbox: {
      //backgroundColor: COLOR.BLUE,
      flexDirection: 'column',
      height: 120,
      //justifyContent: 'space-between',
      margin: 5,
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginTop: 10,
      width: windowWidth * modalWidthScale,
    },
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    modalContents: {
      alignItems: 'center',
      width: windowWidth * modalWidthScale,
    },
    modalFrameView: {
      alignItems: 'center',
      backgroundColor: COLOR.WHITE,
      borderRadius: 20,
      elevation: 5,
      margin: 0,
      paddingHorizontal: 35,
      paddingVertical: 25,
      shadowColor: COLOR.BLACK,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },

    modalOKCancelButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      height: 48,
      justifyContent: 'center',
      padding: 10,
      width: 80,
    },
    modalTitle: {
      fontSize: 20,
      marginBottom: 20,
      textAlign: 'center',
    },
    text: {
      backgroundColor: COLOR.WHITE,
      fontSize: 16,
      height: 40,
      lineHeight: 40,
      marginLeft: 3,
      paddingHorizontal: 5,
      verticalAlign: 'middle',
      textAlignVertical: 'center',
    },
  });

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{`${t('common.gps_settings')}`} </Text>
            <View style={{ borderWidth: 1, borderRadius: 5, padding: 10 }}>
              <Text style={styles.text}>{`${t('common.accuracyAndBattery')}`}</Text>
              <View style={styles.checkbox}>
                {gpsAccuracyList.map((item, index) => (
                  <CheckBox
                    style={{ backgroundColor: COLOR.WHITE }}
                    key={index}
                    label={gpsAccuracyLabels[index]}
                    width={300}
                    checked={index === checkedIndex}
                    onCheck={() => setCheckedIndex(index)}
                    radio={true}
                  />
                ))}
              </View>
            </View>
            <View style={{ borderWidth: 1, borderRadius: 5, padding: 10, marginTop: 10, height: 120 }}>
              <Text style={styles.text}>{`${t('common.mockGPSSettings')}`}</Text>
              <CheckBox
                style={{ backgroundColor: COLOR.WHITE, marginTop: 10 }}
                label={t('common.showMockGPSButton')}
                width={300}
                checked={mockGPSButtonChecked}
                onCheck={() => setMockGPSButtonChecked(!mockGPSButtonChecked)}
                radio={false}
              />
            </View>
            <Text style={styles.alert_text}>{`${t('common.gps_settings_alert')}`} </Text>

            <View style={styles.modalButtonContainer}>
              <Pressable
                style={styles.modalOKCancelButton}
                onPress={() => pressOK(gpsAccuracyList[checkedIndex] as GpsAccuracyType, mockGPSButtonChecked)}
              >
                <Text>OK</Text>
              </Pressable>
              <Pressable style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]} onPress={pressCancel}>
                <Text>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
