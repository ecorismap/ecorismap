import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { COLOR, INFOTOOL } from '../../constants/AppConstants';
import { t } from '../../i18n/config';
import { Button } from '../atoms';
import { InfoToolType } from '../../types';

interface Props {
  currentInfoTool: InfoToolType;
  modalVisible: boolean;

  selectInfoTool: (infoTool: InfoToolType) => void;
  setVisibleInfoPicker: React.Dispatch<React.SetStateAction<boolean>>;
}

export const HomeModalInfoPicker = React.memo((props: Props) => {
  const { currentInfoTool, modalVisible, selectInfoTool, setVisibleInfoPicker } = props;
  const [infoTool, setInfoTool] = React.useState<InfoToolType>('NONE');

  useEffect(() => {
    const defaultInfoTool = currentInfoTool === 'NONE' ? 'ALL_INFO' : currentInfoTool;
    setInfoTool(defaultInfoTool);
  }, [currentInfoTool]);

  const styles = StyleSheet.create({
    checkbox: {
      //backgroundColor: COLOR.BLUE,
      flexDirection: 'column',
      height: 120,
      //justifyContent: 'space-between',
      margin: 5,
      width: 180,
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginTop: 10,
    },
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    modalContents: {
      alignItems: 'center',
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
      marginHorizontal: 5,
      padding: 10,
      width: 80,
    },
    modalTitle: {
      fontSize: 20,
      textAlign: 'center',
    },
    panelBrightnessContainer: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'nowrap',
      marginBottom: 20,
      marginTop: 15,
    },
    shadow: {
      elevation: 5,
      shadowColor: COLOR.BLACK,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,

      shadowRadius: 3.84,
    },
    swatchStyle: {
      borderRadius: 5,
      height: 18,
      width: 18,
    },
  });
  return (
    <Modal animationType="none" transparent={true} visible={modalVisible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={[styles.modalContents, { width: 200, height: 300 }]}>
            <Text style={styles.modalTitle}>{`${t('common.selectionType')}`} </Text>
            <View style={{ flexDirection: 'column', margin: 10 }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => setInfoTool('ALL_INFO')}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    id={'ALL_INFO'}
                    name={INFOTOOL.ALL_INFO}
                    backgroundColor={infoTool === 'ALL_INFO' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => setInfoTool('ALL_INFO')}
                  />
                </View>
                <Text>{`${t('common.selectAllInfo')}`}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => setInfoTool('POINT_INFO')}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    id={'POINT_INFO'}
                    name={INFOTOOL.POINT_INFO}
                    backgroundColor={infoTool === 'POINT_INFO' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => setInfoTool('POINT_INFO')}
                  />
                </View>
                <Text>{`${t('common.selectPointInfo')}`}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => setInfoTool('LINE_INFO')}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    id={'LINE_INFO'}
                    name={INFOTOOL.LINE_INFO}
                    backgroundColor={infoTool === 'LINE_INFO' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => setInfoTool('LINE_INFO')}
                  />
                </View>
                <Text>{`${t('common.selectLineInfo')}`}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center' }}
                onPress={() => setInfoTool('POLYGON_INFO')}
              >
                <View style={{ marginVertical: 5, marginRight: 10 }}>
                  <Button
                    id={'POLYGON_INFO'}
                    name={INFOTOOL.POLYGON_INFO}
                    backgroundColor={infoTool === 'POLYGON_INFO' ? COLOR.ALFARED : COLOR.ALFABLUE}
                    borderRadius={50}
                    onPress={() => setInfoTool('POLYGON_INFO')}
                  />
                </View>
                <Text>{`${t('common.selectPolygonInfo')}`}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalButtonContainer}>
              <TouchableOpacity
                style={styles.modalOKCancelButton}
                onPress={() => {
                  selectInfoTool(infoTool);
                  setVisibleInfoPicker(false);
                }}
              >
                <Text>OK</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalOKCancelButton, { backgroundColor: COLOR.GRAY1 }]}
                onPress={() => {
                  selectInfoTool('NONE');
                  setVisibleInfoPicker(false);
                }}
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
