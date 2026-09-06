import React from 'react';
import { View, Modal, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScrollView } from 'react-native-gesture-handler';
import { Pressable } from '../atoms/Pressable';
import { PointView, LineView, PolygonView } from '../atoms';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { useModalYieldingToDialog } from '../molecules/StyledDialog';
import { t } from '../../i18n/config';
import { LayerType } from '../../types';

interface Props {
  visible: boolean;
  candidates: LayerType[];
  activeLayerId: string | undefined;
  showCreateNew: boolean;
  onSelect: (layer: LayerType) => void;
  onCreateNew: () => void;
  onCancel: () => void;
}

export const HomeModalLayerSelect = React.memo((props: Props) => {
  const { visible, candidates, activeLayerId, showCreateNew, onSelect, onCreateNew, onCancel } = props;
  //確認ダイアログとの行き来があるため、ダイアログ表示中は引っ込み、再表示はdismiss完了を待つ
  const shown = useModalYieldingToDialog(visible);
  const { windowWidth, windowHeight } = useWindow();
  const modalWidthScale = 0.7;

  const styles = StyleSheet.create({
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginTop: 10,
      width: windowWidth * modalWidthScale,
    },
    modalCancelButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      height: 48,
      justifyContent: 'center',
      padding: 10,
      width: 100,
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
    modalCreateNewText: {
      color: COLOR.BLUE,
      fontSize: 16,
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
    modalList: {
      maxHeight: windowHeight * 0.5,
      width: windowWidth * modalWidthScale,
    },
    modalOptionButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      flexDirection: 'row',
      justifyContent: 'flex-start',
      marginBottom: 10,
      padding: 10,
      width: windowWidth * modalWidthScale,
    },
    modalOptionButtonActive: {
      borderColor: COLOR.BLUE,
      borderWidth: 2,
    },
    modalOptionText: {
      fontSize: 16,
    },
    modalTextContainer: {
      flex: 1,
      marginLeft: 10,
    },
    modalTitle: {
      fontSize: 20,
      marginBottom: 15,
      textAlign: 'center',
    },
    symbol: {
      alignItems: 'center',
      justifyContent: 'center',
      width: 24,
    },
  });

  return (
    <Modal animationType="none" transparent={true} visible={shown}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{`${t('Home.layerSelect.title')}`}</Text>
            <ScrollView style={styles.modalList}>
              {candidates.map((layer) => (
                <Pressable
                  key={layer.id}
                  style={[styles.modalOptionButton, layer.id === activeLayerId && styles.modalOptionButtonActive]}
                  onPress={() => onSelect(layer)}
                >
                  <View style={styles.symbol}>
                    {layer.type === 'POINT' && (
                      <PointView color={layer.colorStyle.color} size={20} borderColor={COLOR.WHITE} />
                    )}
                    {layer.type === 'LINE' && <LineView color={layer.colorStyle.color} />}
                    {layer.type === 'POLYGON' && <PolygonView color={layer.colorStyle.color} />}
                  </View>
                  <View style={styles.modalTextContainer}>
                    <Text style={styles.modalOptionText} numberOfLines={1}>
                      {layer.name}
                    </Text>
                  </View>
                  {layer.id === activeLayerId && (
                    <MaterialCommunityIcons name="square-edit-outline" size={20} color={COLOR.BLUE} />
                  )}
                  {!layer.visible && <MaterialCommunityIcons name="eye-off-outline" size={20} color={COLOR.GRAY3} />}
                </Pressable>
              ))}
              {showCreateNew && (
                <Pressable style={styles.modalOptionButton} onPress={onCreateNew}>
                  <View style={styles.symbol}>
                    <MaterialCommunityIcons name="plus" size={20} color={COLOR.BLUE} />
                  </View>
                  <View style={styles.modalTextContainer}>
                    <Text style={styles.modalCreateNewText}>{`${t('Home.layerSelect.createNew')}`}</Text>
                  </View>
                </Pressable>
              )}
            </ScrollView>
            <View style={styles.modalButtonContainer}>
              <Pressable style={styles.modalCancelButton} onPress={onCancel}>
                <Text>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
