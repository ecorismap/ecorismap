import React, { useEffect, useState } from 'react';
import { View, Modal, Text, StyleSheet, Switch, TextInput, ScrollView } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import { CheckBox } from '../molecules/CheckBox';
import { ProximityAlertSettingsType, LayerType } from '../../types';

interface Props {
  visible: boolean;
  proximityAlert: ProximityAlertSettingsType;
  pointLayers: LayerType[];
  pressOK: (value: ProximityAlertSettingsType) => void;
  pressCancel: () => void;
}

export const SettingsModalProximityAlert = React.memo((props: Props) => {
  const { visible, proximityAlert, pointLayers, pressOK, pressCancel } = props;
  const { windowWidth } = useWindow();
  const modalWidthScale = 0.85;

  const [enabled, setEnabled] = useState(false);
  const [targetLayerIds, setTargetLayerIds] = useState<string[]>([]);
  const [distanceThreshold, setDistanceThreshold] = useState('10');

  useEffect(() => {
    setEnabled(proximityAlert.enabled);
    setTargetLayerIds(proximityAlert.targetLayerIds);
    setDistanceThreshold(String(proximityAlert.distanceThreshold));
  }, [proximityAlert]);

  const handleLayerToggle = (layerId: string) => {
    setTargetLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId]
    );
  };

  const handleOK = () => {
    const distance = parseInt(distanceThreshold, 10);
    pressOK({
      enabled,
      targetLayerIds,
      distanceThreshold: isNaN(distance) || distance < 1 ? 10 : Math.min(distance, 500),
    });
  };

  const styles = StyleSheet.create({
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
      backgroundColor: COLOR.SAVING_OVERLAY,
    },
    modalFrameView: {
      alignItems: 'center',
      backgroundColor: COLOR.WHITE,
      borderRadius: 20,
      elevation: 5,
      margin: 0,
      paddingHorizontal: 20,
      paddingVertical: 25,
      shadowColor: COLOR.BLACK,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      maxHeight: '80%',
    },
    modalContents: {
      alignItems: 'center',
      width: windowWidth * modalWidthScale,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      marginBottom: 20,
      textAlign: 'center',
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      marginTop: 15,
      marginBottom: 10,
      alignSelf: 'flex-start',
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: COLOR.GRAY2,
    },
    switchLabel: {
      fontSize: 16,
    },
    layerList: {
      width: '100%',
      maxHeight: 200,
      borderWidth: 1,
      borderColor: COLOR.GRAY2,
      borderRadius: 5,
      padding: 10,
    },
    distanceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      paddingVertical: 10,
    },
    distanceInput: {
      borderWidth: 1,
      borderColor: COLOR.GRAY2,
      borderRadius: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      width: 80,
      textAlign: 'center',
      fontSize: 16,
    },
    distanceUnit: {
      fontSize: 16,
      marginLeft: 5,
    },
    helpText: {
      fontSize: 12,
      color: COLOR.GRAY4,
      marginTop: 5,
      alignSelf: 'flex-start',
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginTop: 20,
      width: '100%',
    },
    modalOKCancelButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      height: 48,
      justifyContent: 'center',
      padding: 10,
      width: 100,
    },
    noLayerText: {
      fontSize: 14,
      color: COLOR.GRAY4,
      textAlign: 'center',
      padding: 20,
    },
  });

  return (
    <Modal animationType="fade" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{t('settings.proximityAlert.title')}</Text>

            {/* 有効/無効スイッチ */}
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('settings.proximityAlert.enable')}</Text>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: COLOR.GRAY2, true: COLOR.BLUE }}
              />
            </View>

            {/* 通知距離設定 */}
            <Text style={styles.sectionTitle}>{t('settings.proximityAlert.distance')}</Text>
            <View style={styles.distanceRow}>
              <Text style={styles.switchLabel}>{t('settings.proximityAlert.threshold')}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TextInput
                  style={styles.distanceInput}
                  value={distanceThreshold}
                  onChangeText={setDistanceThreshold}
                  keyboardType="numeric"
                  maxLength={3}
                />
                <Text style={styles.distanceUnit}>m</Text>
              </View>
            </View>
            <Text style={styles.helpText}>{t('settings.proximityAlert.distanceHelp')}</Text>

            {/* 対象レイヤー選択 */}
            <Text style={styles.sectionTitle}>{t('settings.proximityAlert.targetLayers')}</Text>
            <ScrollView style={styles.layerList}>
              {pointLayers.length === 0 ? (
                <Text style={styles.noLayerText}>{t('settings.proximityAlert.noPointLayers')}</Text>
              ) : (
                pointLayers.map((layer) => (
                  <CheckBox
                    key={layer.id}
                    label={layer.name}
                    width={windowWidth * modalWidthScale - 60}
                    checked={targetLayerIds.includes(layer.id)}
                    onCheck={() => handleLayerToggle(layer.id)}
                    radio={false}
                  />
                ))
              )}
            </ScrollView>

            {/* ボタン */}
            <View style={styles.modalButtonContainer}>
              <Pressable style={styles.modalOKCancelButton} onPress={handleOK}>
                <Text>OK</Text>
              </Pressable>
              <Pressable
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={pressCancel}
              >
                <Text>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
