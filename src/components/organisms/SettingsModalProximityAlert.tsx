import React, { useEffect, useState } from 'react';
import { View, Modal, Text, StyleSheet, Switch, ScrollView } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import { CheckBox } from '../molecules/CheckBox';
import { ProximityAlertSettingsType, LayerType } from '../../types';

// 選択可能な距離オプション
const DISTANCE_OPTIONS = [5, 10, 20, 50, 100, 500, 1000] as const;

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
  const [distanceThreshold, setDistanceThreshold] = useState(10);

  useEffect(() => {
    setEnabled(proximityAlert.enabled);
    setTargetLayerIds(proximityAlert.targetLayerIds);
    // 既存の値が選択肢にない場合は最も近い値を選択
    const validDistance = DISTANCE_OPTIONS.includes(proximityAlert.distanceThreshold as typeof DISTANCE_OPTIONS[number])
      ? proximityAlert.distanceThreshold
      : DISTANCE_OPTIONS.reduce((prev, curr) =>
          Math.abs(curr - proximityAlert.distanceThreshold) < Math.abs(prev - proximityAlert.distanceThreshold)
            ? curr
            : prev
        );
    setDistanceThreshold(validDistance);
  }, [proximityAlert]);

  const handleLayerToggle = (layerId: string) => {
    setTargetLayerIds((prev) =>
      prev.includes(layerId) ? prev.filter((id) => id !== layerId) : [...prev, layerId]
    );
  };

  const handleOK = () => {
    pressOK({
      enabled,
      targetLayerIds,
      distanceThreshold,
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
    distanceOptionsContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      width: '100%',
      gap: 8,
      paddingVertical: 10,
    },
    distanceOption: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 5,
      borderWidth: 1,
      borderColor: COLOR.GRAY2,
      backgroundColor: COLOR.WHITE,
    },
    distanceOptionSelected: {
      borderColor: COLOR.BLUE,
      backgroundColor: COLOR.ALFABLUE2,
    },
    distanceOptionText: {
      fontSize: 14,
      color: COLOR.GRAY4,
    },
    distanceOptionTextSelected: {
      color: COLOR.BLUE,
      fontWeight: 'bold',
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
            <View style={styles.distanceOptionsContainer}>
              {DISTANCE_OPTIONS.map((distance) => (
                <Pressable
                  key={distance}
                  style={[
                    styles.distanceOption,
                    distanceThreshold === distance && styles.distanceOptionSelected,
                  ]}
                  onPress={() => setDistanceThreshold(distance)}
                >
                  <Text
                    style={[
                      styles.distanceOptionText,
                      distanceThreshold === distance && styles.distanceOptionTextSelected,
                    ]}
                  >
                    {distance}m
                  </Text>
                </Pressable>
              ))}
            </View>

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
                    style={{ backgroundColor: COLOR.WHITE }}
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
