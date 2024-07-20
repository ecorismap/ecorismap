import React, { useState, useEffect, useMemo } from 'react';
import { View, TouchableOpacity, Modal, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useSelector } from 'react-redux';
import { COLOR } from '../../constants/AppConstants';
import { AppState } from '../../modules';
import { LayerType } from '../../types';
import { Picker } from '../atoms';
import { CheckBox } from '../molecules/CheckBox';

interface Props {
  visible: boolean;
  settings: { hisyouzuTool: { active: boolean; layerId: string | undefined } };
  pressOK: (drawToolsSettings: { hisyouzuTool: { active: boolean; layerId: string | undefined } }) => void;
  pressCancel: () => void;
}

export const HomeModalDrawToolsSettings = React.memo((props: Props) => {
  //console.log('render ModalTileMap');
  const { visible, settings, pressOK, pressCancel } = props;
  const layers = useSelector((state: RootState) => state.layers);

  const actionLayerCondition = (layer: LayerType) => {
    return (
      layer.type === 'LINE' &&
      layer.field.map((f) => f.name).includes('飛翔凡例') &&
      layer.field.map((f) => f.name).includes('消失')
    );
  };
  const layerIds = useMemo(
    () => layers.filter((layer) => actionLayerCondition(layer)).map((layer) => layer.id),
    [layers]
  );
  const layerNames = useMemo(
    () => layers.filter((layer) => actionLayerCondition(layer)).map((layer) => layer.name),
    [layers]
  );

  const [active, setActive] = useState(false);
  const [layerId, setLayerId] = useState<string | undefined>(undefined);
  const screenData = useWindowDimensions();
  const modalWidthScale = 0.7;

  useEffect(() => {
    const hisyouzuTool = settings.hisyouzuTool;
    setActive(hisyouzuTool.active);
    setLayerId(hisyouzuTool.layerId);
  }, [settings]);

  const styles = StyleSheet.create({
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginTop: 10,
      width: screenData.width * modalWidthScale,
    },
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    modalContents: {
      alignItems: 'center',
      width: screenData.width * modalWidthScale,
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
    modalHeaderButton: {
      position: 'absolute',
      right: -20,
      top: -10,
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
    modalTextInput: {
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      height: 40,
      marginBottom: 10,
      paddingHorizontal: 5,
      width: screenData.width * modalWidthScale,
    },
    modalTitle: {
      fontSize: 20,
      marginBottom: 10,
      textAlign: 'center',
    },
  });

  const drawToolsSettings = () => {
    return {
      ...settings,
      hisyouzuTool: {
        active: active,
        layerId: layerId,
      },
    };
  };

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>飛翔図ツールの設定 </Text>

            <View style={{ flexDirection: 'row' }}>
              <CheckBox
                style={{ backgroundColor: COLOR.WHITE }}
                label={'active'}
                width={screenData.width * modalWidthScale * 0.5}
                checked={active}
                onCheck={(checked) => setActive(checked)}
              />
              <Picker
                selectedValue={layerId ?? ''}
                onValueChange={(itemValue) =>
                  itemValue === '' ? setLayerId(undefined) : setLayerId(itemValue as string)
                }
                itemLabelArray={layerNames}
                itemValueArray={layerIds}
                maxIndex={layerIds.length - 1}
              />
            </View>

            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={styles.modalOKCancelButton} onPress={() => pressOK(drawToolsSettings())}>
                <Text>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={pressCancel}
              >
                <Text>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
