import React, { useCallback, useEffect } from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';

import HeaderRightButton from '../molecules/HeaderRightButton';
import { COLOR, NAV_BTN } from '../../constants/AppConstants';
import { DataTable } from '../organisms/DataTable';
import { DataButton } from '../organisms/DataButton';

import { RecordType, LayerType, FormatType } from '../../types';
import { useNavigation } from '@react-navigation/native';
import { HeaderBackButton, HeaderBackButtonProps } from '@react-navigation/elements';
import { SortOrderType } from '../../utils/Data';
import { useDisplay } from '../../hooks/useDisplay';

interface Props {
  projectId: string | undefined;
  data: RecordType[];
  layer: LayerType;
  isChecked: boolean;
  checkList: boolean[];
  sortedOrder: SortOrderType;
  sortedName: string;

  pressAddData: () => void;
  pressDeleteData: () => void;
  pressExportData: () => void;
  changeOrder: (colname: string, format: FormatType | '_user_') => void;
  changeChecked: (index: number, checked: boolean) => void;
  changeVisible: (index: number, visible: boolean) => void;
  gotoDataEdit: (index: number) => void;
  gotoBack: () => void;
}

export default function DataScreen(props: Props) {
  //console.log('render Data');

  const {
    projectId,
    data,
    layer,
    isChecked,
    checkList,
    sortedOrder,
    sortedName,
    changeOrder,
    changeChecked,
    changeVisible,
    pressAddData,
    pressDeleteData,
    pressExportData,
    gotoDataEdit,
    gotoBack,
  } = props;
  const navigation = useNavigation();
  const { isDataOpened, expandData, openData, closeData } = useDisplay();

  const headerLeftButton = useCallback(
    (props_: JSX.IntrinsicAttributes & HeaderBackButtonProps) => <HeaderBackButton {...props_} onPress={gotoBack} />,
    [gotoBack]
  );

  const headerRightButton = useCallback(() => {
    return (
      <View style={{ flexDirection: 'row' }}>
        <HeaderRightButton
          name={isDataOpened === 'opened' ? NAV_BTN.EXPAND : NAV_BTN.COLLAPSE}
          backgroundColor={COLOR.GRAY0}
          onPress={isDataOpened === 'opened' ? expandData : openData}
          borderRadius={5}
          size={21}
          color={COLOR.BLACK}
        />
        <HeaderRightButton
          name={NAV_BTN.CLOSE}
          backgroundColor={COLOR.GRAY0}
          onPress={closeData}
          borderRadius={5}
          size={21}
          color={COLOR.BLACK}
        />
      </View>
    );
  }, [closeData, expandData, isDataOpened, openData]);

  useEffect(() => {
    navigation.setOptions({
      title: layer.name,

      // eslint-disable-next-line @typescript-eslint/no-shadow
      headerLeft: (props: JSX.IntrinsicAttributes & HeaderBackButtonProps) => headerLeftButton(props),
      headerRight: () => headerRightButton(),
    });
  }, [
    closeData,
    expandData,
    gotoBack,
    headerLeftButton,
    headerRightButton,
    isChecked,
    isDataOpened,
    layer.name,
    navigation,
    openData,
  ]);

  return (
    <View style={styles.container}>
      <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
        <DataTable
          projectId={projectId}
          data={data}
          layer={layer}
          checkList={checkList}
          sortedOrder={sortedOrder}
          sortedName={sortedName}
          onSort={changeOrder}
          onPress={gotoDataEdit}
          changeChecked={changeChecked}
          changeVisible={changeVisible}
        />
      </ScrollView>

      <DataButton
        exportDisabled={projectId !== undefined}
        isChecked={isChecked}
        addData={pressAddData}
        deleteData={pressDeleteData}
        pressExportData={pressExportData}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
