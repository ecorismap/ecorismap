import React, { useState, useEffect, useMemo } from 'react';
import { View, TouchableOpacity, Modal, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { useSelector } from 'react-redux';
import Picker from '../../components/atoms/Picker';
import { COLOR } from '../../constants/AppConstants';
import { AppState } from '../../modules';
import { LayerType } from '../../types';

interface Props {
  visible: boolean;
  hisyouLayerId: string;
  pressOK: (layerId: string) => void;
  pressCancel: () => void;
}

export const ModalHisyouToolSetting = React.memo((props: Props) => {
  //console.log('render ModalTileMap');
  const { visible, hisyouLayerId, pressOK, pressCancel } = props;
  const [layerId, setLayerId] = useState('');
  const layers = useSelector((state: AppState) => state.layers);

  const screenData = useWindowDimensions();
  const modalWidthScale = 0.7;

  const isHisyouLayer = (layer: LayerType) => {
    return (
      layer.type === 'LINE' &&
      layer.field.map((f) => f.name).includes('飛翔凡例') &&
      layer.field.map((f) => f.name).includes('_ref')
    );
  };
  const layerIds = useMemo(
    () => ['', ...layers.filter((layer) => isHisyouLayer(layer)).map((layer) => layer.id)],
    [layers]
  );
  const layerNames = useMemo(
    () => ['', ...layers.filter((layer) => isHisyouLayer(layer)).map((layer) => layer.name)],
    [layers]
  );

  useEffect(() => {
    setLayerId(hisyouLayerId);
  }, [hisyouLayerId]);

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={[styles.modalContents, { width: screenData.width * modalWidthScale }]}>
            <Text style={styles.modalTitle}>飛翔レイヤを選択 </Text>

            <View style={{ height: 60, width: screenData.width * modalWidthScale, flexDirection: 'row' }}>
              <Picker
                selectedValue={layerId}
                onValueChange={(itemValue) => setLayerId(itemValue as string)}
                itemLabelArray={layerNames}
                itemValueArray={layerIds}
                maxIndex={layerIds.length - 1}
              />
            </View>

            <View style={[styles.modalButtonContainer, { width: screenData.width * modalWidthScale }]}>
              <TouchableOpacity style={styles.modalOKCancelButton} onPress={() => pressOK(layerId)}>
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

const styles = StyleSheet.create({
  modalButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 10,
    width: 300,
  },
  modalCenteredView: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  modalContents: {
    alignItems: 'center',
    width: 300,
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

  modalTitle: {
    fontSize: 20,
    marginBottom: 10,
    textAlign: 'center',
  },
});
