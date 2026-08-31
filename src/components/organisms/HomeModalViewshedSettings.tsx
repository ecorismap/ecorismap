import React from 'react';
import { View, Modal, Text, StyleSheet, Platform, TextInput } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import { useModalYieldingToDialog } from '../molecules/StyledDialog';
import { Pressable } from '../atoms/Pressable';
import { CheckBox } from '../molecules/CheckBox';

interface Props {
  visible: boolean;
  distanceKm: string;
  observerHeight: string;
  // 長押し位置の近くの既存ポイント名。あればそれを中心に使うチェックボックスを表示する
  snapName?: string;
  useSnapPoint: boolean;
  setDistanceKm: React.Dispatch<React.SetStateAction<string>>;
  setObserverHeight: React.Dispatch<React.SetStateAction<string>>;
  setUseSnapPoint: React.Dispatch<React.SetStateAction<boolean>>;
  pressOK: () => void;
  pressCancel: () => void;
}

export const HomeModalViewshedSettings = React.memo((props: Props) => {
  const {
    visible,
    distanceKm,
    observerHeight,
    snapName,
    useSnapPoint,
    setDistanceKm,
    setObserverHeight,
    setUseSnapPoint,
    pressOK,
    pressCancel,
  } = props;
  //入力値エラーのアラートが出ている間は引っ込める（値はコンテナ側stateなので消えない）
  const shown = useModalYieldingToDialog(visible);

  const { windowWidth } = useWindow();
  const modalWidthScale = 0.7;

  const styles = StyleSheet.create({
    input: {
      backgroundColor: COLOR.GRAY0,
      borderColor: COLOR.GRAY2,
      borderRadius: 5,
      borderWidth: 1,
      fontSize: 16,
      height: 40,
      paddingHorizontal: 12,
      width: 100,
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginTop: 20,
      width: Platform.OS === 'web' ? 300 : windowWidth * modalWidthScale,
    },
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    modalContents: {
      alignItems: 'center',
      width: Platform.OS === 'web' ? 300 : windowWidth * modalWidthScale,
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
      marginBottom: 10,
      textAlign: 'center',
    },
  });

  return (
    <Modal animationType="none" transparent={true} visible={shown}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{`${t('Home.viewshed.title')}`}</Text>

            <View style={{ flexDirection: 'column' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ fontSize: 14, width: 120 }}>{`${t('Home.viewshed.distance')}:`}</Text>
                <TextInput
                  style={styles.input}
                  value={distanceKm}
                  onChangeText={setDistanceKm}
                  keyboardType="numeric"
                  placeholder="3"
                  placeholderTextColor={COLOR.GRAY3}
                />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, width: 120 }}>{`${t('Home.viewshed.observerHeight')}:`}</Text>
                <TextInput
                  style={styles.input}
                  value={observerHeight}
                  onChangeText={setObserverHeight}
                  keyboardType="numeric"
                  placeholder="2"
                  placeholderTextColor={COLOR.GRAY3}
                />
              </View>
              {snapName !== undefined && (
                // CheckBoxはルートがflex:1のため、固定高さのViewでラップしないと
                // モーダルが全画面に広がる（HomeModalPDFSettingsと同じ対処）
                <View style={{ marginTop: 10, height: 45, width: Platform.OS === 'web' ? 300 : windowWidth * modalWidthScale }}>
                  <CheckBox
                    style={{ backgroundColor: COLOR.WHITE }}
                    label={t('Home.viewshed.useSnapPoint', { name: snapName })}
                    labelSize={14}
                    width={Platform.OS === 'web' ? 300 : windowWidth * modalWidthScale}
                    checked={useSnapPoint}
                    onCheck={setUseSnapPoint}
                    numberOfLines={2}
                  />
                </View>
              )}
            </View>

            <View style={styles.modalButtonContainer}>
              <Pressable style={styles.modalOKCancelButton} onPress={pressOK}>
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
