import React from 'react';
import { View, TouchableOpacity, Modal, Text, StyleSheet, Platform } from 'react-native';
import { COLOR, ORIENTATIONTYPE } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import { PaperOrientationType, PaperSizeType, ScaleType } from '../../types';
import Picker from '../atoms/Picker';
import { CheckBox } from '../molecules/CheckBox';

interface Props {
  visible: boolean;
  pdfOrientation: PaperOrientationType;
  pdfPaperSize: PaperSizeType;
  pdfScale: ScaleType;
  pdfOrientations: PaperOrientationType[];
  pdfPaperSizes: PaperSizeType[];
  pdfScales: ScaleType[];
  pdfTileMapZoomLevel: string;
  pdfTileMapZoomLevels: string[];
  outputVRT: boolean;
  outputDataPDF: boolean;
  pressOK: () => void;
  setPdfOrientation: React.Dispatch<React.SetStateAction<PaperOrientationType>>;
  setPdfPaperSize: React.Dispatch<React.SetStateAction<PaperSizeType>>;
  setPdfScale: React.Dispatch<React.SetStateAction<ScaleType>>;
  setPdfTileMapZoomLevel: React.Dispatch<React.SetStateAction<string>>;
  setOutputVRT: React.Dispatch<React.SetStateAction<boolean>>;
  setOutputDataPDF: React.Dispatch<React.SetStateAction<boolean>>;
}

export const HomeModalPDFSettings = React.memo((props: Props) => {
  const {
    visible,
    pdfOrientation,
    pdfPaperSize,
    pdfScale,
    pdfOrientations,
    pdfPaperSizes,
    pdfScales,
    pdfTileMapZoomLevel,
    pdfTileMapZoomLevels,
    outputVRT,
    outputDataPDF,
    setPdfOrientation,
    setPdfPaperSize,
    setPdfScale,
    setPdfTileMapZoomLevel,
    setOutputVRT,
    setOutputDataPDF,
    pressOK,
  } = props;

  const { windowWidth } = useWindow();
  const modalWidthScale = 0.7;

  const pdfScalesLabel = pdfScales.map((v) => `1:${parseInt(v, 10).toLocaleString('en-US')}`);

  const styles = StyleSheet.create({
    input: {
      backgroundColor: COLOR.WHITE,
      borderColor: COLOR.GRAY1,
      borderWidth: 1,
      fontSize: 16,
      height: 40,
      paddingHorizontal: 12,
      width: Platform.OS === 'web' ? 300 : windowWidth * modalWidthScale,
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginTop: 10,
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
      width: Platform.OS === 'web' ? 300 : windowWidth * modalWidthScale,
    },
    modalTitle: {
      fontSize: 20,
      marginBottom: 10,
      textAlign: 'center',
    },
  });

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{`${t('common.pdfSettings')}`} </Text>

            <View style={{ flexDirection: 'column' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, width: 120 }}>{`${t('common.paperSize')}:`}</Text>
                <View style={{ width: 155, height: 45, borderWidth: 1, borderRadius: 2, margin: 1 }}>
                  <Picker
                    selectedValue={pdfPaperSize}
                    onValueChange={(itemValue) => setPdfPaperSize(itemValue as PaperSizeType)}
                    itemLabelArray={pdfPaperSizes}
                    itemValueArray={pdfPaperSizes}
                    maxIndex={pdfPaperSizes.length - 1}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, width: 120 }}>{`${t('common.orientation')}:`}</Text>
                <View style={{ width: 155, height: 45, borderWidth: 1, borderRadius: 2, margin: 1 }}>
                  <Picker
                    selectedValue={pdfOrientation}
                    onValueChange={(itemValue) => setPdfOrientation(itemValue as PaperOrientationType)}
                    itemLabelArray={Object.values(ORIENTATIONTYPE)}
                    itemValueArray={pdfOrientations}
                    maxIndex={pdfOrientations.length - 1}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, width: 120 }}>{`${t('common.scale')}:`}</Text>
                <View style={{ width: 155, height: 45, borderWidth: 1, borderRadius: 2, margin: 1 }}>
                  <Picker
                    selectedValue={pdfScale}
                    onValueChange={(itemValue) => setPdfScale(itemValue as ScaleType)}
                    itemLabelArray={pdfScalesLabel}
                    itemValueArray={pdfScales}
                    maxIndex={pdfScales.length - 1}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, width: 120 }}>{`${t('common.zoomlevelOfMaps')}:`}</Text>
                <View style={{ width: 155, height: 45, borderWidth: 1, borderRadius: 2, margin: 1 }}>
                  <Picker
                    selectedValue={pdfTileMapZoomLevel}
                    onValueChange={(itemValue) => setPdfTileMapZoomLevel(itemValue as string)}
                    itemLabelArray={pdfTileMapZoomLevels}
                    itemValueArray={pdfTileMapZoomLevels}
                    maxIndex={pdfTileMapZoomLevels.length - 1}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, width: 120 }}>{`${t('common.outputVRT')}:`}</Text>
                <View style={{ width: 155, height: 45, margin: 1 }}>
                  <CheckBox
                    style={{ backgroundColor: COLOR.WHITE }}
                    width={windowWidth * modalWidthScale * 0.5}
                    checked={outputVRT}
                    onCheck={setOutputVRT}
                  />
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 14, width: 120 }}>{`${t('common.outputDataPDF')}:`}</Text>
                <View style={{ width: 155, height: 45, margin: 1 }}>
                  <CheckBox
                    style={{ backgroundColor: COLOR.WHITE }}
                    width={windowWidth * modalWidthScale * 0.5}
                    checked={outputDataPDF}
                    onCheck={setOutputDataPDF}
                  />
                </View>
              </View>
            </View>

            <View style={styles.modalButtonContainer}>
              <TouchableOpacity style={styles.modalOKCancelButton} onPress={() => pressOK()}>
                <Text>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
