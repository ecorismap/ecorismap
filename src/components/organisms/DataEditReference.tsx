import React, { useContext, useMemo } from 'react';
import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { useData } from '../../hooks/useData';
import { LayerType, PhotoType, RecordType } from '../../types';
import dayjs from '../../i18n/dayjs';
import { Button } from '../atoms';
import { DataEditContext } from '../../contexts/DataEdit';
import { ScrollView } from 'react-native-gesture-handler';
import { DictionaryTextInput } from '../molecules/DictionaryTextInput';

interface Props {
  name: string;
  list:
    | {
        value: string;
        isOther: boolean;
        customFieldValue: string;
      }[]
    | undefined;
  refLayer: LayerType;
  onPress: (referenceData: RecordType, referenceLayer: LayerType) => void;
  pressAddReferenceData: (
    referenceLayer: LayerType,
    addRecord: () => RecordType,
    fields: { [key: string]: string | number | PhotoType[] }
  ) => void;
  pressAddReferenceDataByDictinary: (
    referenceLayer: LayerType,
    addRecord: () => RecordType,
    fields: { [key: string]: string | number | PhotoType[] },
    value: string
  ) => void;
}

export const DataEditReference = (props: Props) => {
  const { data } = useContext(DataEditContext);
  const { name, list, refLayer, onPress, pressAddReferenceData, pressAddReferenceDataByDictinary } = props;

  const refField = useMemo(
    () =>
      (list && list[1] && (list[1].value === '__CUSTOM' ? list[1].customFieldValue.split('|') : [list[1].value])) || [
        '',
      ],
    [list]
  );
  const primaryField = useMemo(
    () =>
      (list && list[2] && (list[2].value === '__CUSTOM' ? list[2].customFieldValue.split('|') : [list[2].value])) || [
        '',
      ],
    [list]
  );
  const primaryKey = useMemo(
    () => (primaryField[0] === '_id' ? [data.id] : primaryField.map((f) => data.field[f])),
    [data.field, data.id, primaryField]
  );

  const { allUserRecordSet, addDefaultRecord } = useData(refLayer.id);
  const refData = useMemo(() => {
    return allUserRecordSet
      .filter((d) => refField.every((ref, index) => d.field[ref] === primaryKey[index]))
      .filter((d) => d.field._group === undefined || d.field._group === '')
      .reverse();
  }, [allUserRecordSet, primaryKey, refField]);

  const fields = useMemo(() => {
    return refField.reduce((obj, f, index) => {
      //@ts-ignore
      obj[f] = primaryKey[index];
      return obj;
    }, {});
  }, [primaryKey, refField]);

  return refLayer && refField && primaryKey ? (
    <View style={{ flexDirection: 'column', marginVertical: 10, borderTopWidth: 5, borderColor: COLOR.GRAY2 }}>
      <View style={styles.tr3}>
        <View
          style={{
            margin: 5,
            flex: 1,
            paddingHorizontal: 10,
            height: 40,
            justifyContent: 'center',
          }}
        >
          <Text style={styles.title}>{name}</Text>
        </View>

        <View style={[styles.td3, { minWidth: 40, justifyContent: 'flex-end' }]}>
          {(refLayer.type === 'NONE' || refLayer.type === 'POINT') && (
            <Button
              style={{
                backgroundColor: COLOR.GRAY3,
                padding: 0,
              }}
              size={20}
              name="plus"
              onPress={() => pressAddReferenceData(refLayer, addDefaultRecord, fields)}
            />
          )}
        </View>
      </View>
      <View style={[styles.td3, { minWidth: 40, justifyContent: 'flex-end' }]}>
        {refLayer.dictionaryFieldId !== undefined && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', margin: 10 }}>
            <DictionaryTextInput
              initialValue=""
              table={`_${refLayer.id}_${refLayer.dictionaryFieldId}`}
              handleSelect={(text: string) =>
                pressAddReferenceDataByDictinary(refLayer, addDefaultRecord, fields, text)
              }
              clearOnSelect
            />
          </View>
        )}
      </View>
      <ScrollView horizontal={true} contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flex: 1, flexDirection: 'column' }}>
          <DataTitle layer={refLayer} />
          <DataItems data={refData} layer={refLayer} onPress={(index: number) => onPress(refData[index], refLayer)} />
        </View>
      </ScrollView>
    </View>
  ) : null;
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
          <TouchableOpacity key={item.id} style={{ height: 45, flexDirection: 'row' }} onPress={() => onPress(index)}>
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
    fontSize: 12,
  },
  tr3: {
    //backgroundColor: COLOR.GRAY1,
    //borderColor: COLOR.GRAY1,
    //borderWidth: 1,
    flexDirection: 'row',
    //height: 30,
  },
});
