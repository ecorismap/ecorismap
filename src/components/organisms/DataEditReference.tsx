import React, { useCallback, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { useData } from '../../hooks/useData';
import { LayerType, PhotoType, RecordType } from '../../types';
import dayjs from '../../i18n/dayjs';
import { Button } from '../atoms';
import { Alert } from '../atoms/Alert';

interface Props {
  name: string;
  primaryKey: string | number | PhotoType[];
  refLayer: LayerType;
  refField: string;
  isEditingRecord: boolean;
  onPress: (referenceData: RecordType, referenceLayer: LayerType) => void;
  pressAddReferenceData: (referenceData: RecordType | undefined, referenceLayer: LayerType, message: string) => void;
}

export const DataEditReference = (props: Props) => {
  const { name, primaryKey, refLayer, refField, isEditingRecord, onPress, pressAddReferenceData } = props;
  const { allUserRecordSet, addRecord } = useData(refLayer);

  const data = useMemo(
    () => allUserRecordSet.filter((d) => d.field[refField] === primaryKey),
    [allUserRecordSet, primaryKey, refField]
  );

  const addReferenceData = useCallback(
    async (referenceLayer: LayerType) => {
      if (isEditingRecord) {
        Alert.alert('', '一旦変更を保存してください。');
        return;
      }
      const referenceData = addRecord();
      const message = 'need refactoring!!!';
      pressAddReferenceData(referenceData, referenceLayer, message);
    },
    [addRecord, isEditingRecord, pressAddReferenceData]
  );

  return (
    <View style={{ flexDirection: 'column', flex: 1 }}>
      <View style={styles.tr3}>
        <View style={{ margin: 5, flex: 100, paddingHorizontal: 10 }}>
          <Text style={styles.title}>{name}</Text>
        </View>
        <View style={[styles.td3, { minWidth: 40, justifyContent: 'flex-end' }]}>
          {refLayer.type === 'NONE' ||
            (refLayer.type === 'POINT' && (
              <Button
                style={{
                  backgroundColor: COLOR.GRAY3,
                  padding: 0,
                }}
                name="plus"
                onPress={() => addReferenceData(refLayer)}
              />
            ))}
        </View>
      </View>
      <DataTitle layer={refLayer} />
      <DataItems data={data} layer={refLayer} onPress={(index: number) => onPress(data[index], refLayer)} />
    </View>
  );
};

interface Props_DataTitle {
  layer: LayerType;
}
const DataTitle = React.memo((props: Props_DataTitle) => {
  const { layer } = props;

  return (
    <View style={{ flexDirection: 'row', height: 45 }}>
      {layer.field.map(({ name }, field_index) => (
        <View key={field_index} style={[styles.th, { flex: 2, width: 120 }]}>
          <Text>{name}</Text>
        </View>
      ))}
    </View>
  );
});

interface Props_DataItems {
  data: RecordType[];
  layer: LayerType;
  onPress: (index: number) => void;
}

const DataItems = React.memo((props: Props_DataItems) => {
  const { data, layer, onPress } = props;

  return (
    <View style={{ flex: 1, flexDirection: 'column' }}>
      {data.map((item, index) => {
        return (
          <TouchableOpacity
            key={item.id}
            style={{ flex: 1, height: 45, flexDirection: 'row' }}
            onPress={() => onPress(index)}
          >
            {layer.field.map(({ name, format }, field_index) => (
              <View key={field_index} style={[styles.td, { flex: 1, width: 120 }]}>
                <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                  {format === 'DATETIME' && item.field[name] !== ''
                    ? `${dayjs(item.field[name] as string).format('L HH:mm')}`
                    : format === 'PHOTO'
                    ? `${(item.field[name] as PhotoType[]).length} pic`
                    : `${item.field[name]}`}
                </Text>
              </View>
            ))}
          </TouchableOpacity>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    //flex: 1,
    //flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
    //borderRightWidth: 1,
  },
  td3: {
    alignItems: 'center',
    borderColor: COLOR.GRAY2,
    //borderTopWidth: 1,
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  th: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderColor: COLOR.GRAY2,
    borderRightWidth: 1,
    //flex: 1,
    // flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  title: {
    color: COLOR.GRAY3,
    flex: 1,
    fontSize: 12,
  },
  tr3: {
    //backgroundColor: COLOR.GRAY1,
    //borderColor: COLOR.GRAY1,
    //borderWidth: 1,
    flexDirection: 'row',
    height: 30,
  },
});
