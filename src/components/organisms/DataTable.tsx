import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { Button, RectButton2 } from '../atoms';
import { CheckBox } from '../molecules/CheckBox';
import { RecordType, LayerType, PhotoType, FormatType } from '../../types';
import { SortOrderType } from '../../utils/Data';
import dayjs from '../../i18n/dayjs';

interface Props {
  projectId: string | undefined;
  data: RecordType[];
  layer: LayerType;
  checkList: boolean[];
  sortedOrder: SortOrderType;
  sortedName: string;
  onSort: (colname: string, format: FormatType | '_user_') => void;
  onPress: (index: number) => void;
  changeChecked: (index: number, doCheck: boolean) => void;
  changeVisible: (index: number, visible: boolean) => void;
}

export const DataTable = React.memo((props: Props) => {
  const { projectId, data, layer, checkList, sortedOrder, sortedName, onSort, onPress, changeChecked, changeVisible } =
    props;
  //console.log(data[0]);
  const [checkedAll, setCheckedAll] = useState(false);
  const [visibleAll, setVisibleAll] = useState(true);

  const onCheckAll = useCallback(() => {
    setCheckedAll(!checkedAll);
    changeChecked(-1, !checkedAll);
  }, [changeChecked, checkedAll]);

  const onVisibleAll = useCallback(() => {
    setVisibleAll(!visibleAll);
    changeVisible(-1, !visibleAll);
  }, [changeVisible, visibleAll]);

  return (
    <View style={{ flexDirection: 'column', flex: 1, marginBottom: 10 }}>
      <DataTitle
        {...{
          projectId,
          layer,
          visibleAll,
          sortedOrder,
          sortedName,
          onVisibleAll,
          checkedAll,
          onCheckAll,
          onSort,
        }}
      />
      <DataItems
        projectId={projectId}
        data={data}
        layer={layer}
        checkList={checkList}
        changeVisible={changeVisible}
        changeChecked={changeChecked}
        onPress={onPress}
      />
    </View>
  );
});

interface Props_DataTitle {
  projectId: string | undefined;
  layer: LayerType;
  visibleAll: boolean;
  sortedOrder: SortOrderType;
  sortedName: string;
  onVisibleAll: () => void;
  checkedAll: boolean;
  onCheckAll: (doCheck: boolean) => void;
  onSort: (colname: string, format: FormatType | '_user_') => void;
}
const DataTitle = React.memo((props: Props_DataTitle) => {
  const { projectId, layer, visibleAll, sortedOrder, sortedName, onVisibleAll, checkedAll, onCheckAll, onSort } = props;

  return (
    <View style={{ flexDirection: 'row', height: 45 }}>
      <View style={[styles.th, { width: 50 }]}>
        <MaterialCommunityIcons
          name={visibleAll ? 'eye' : 'eye-off-outline'}
          size={24}
          color="black"
          onPress={onVisibleAll}
        />
      </View>
      <View style={[styles.th, { width: 60 }]}>
        <CheckBox style={{ backgroundColor: COLOR.GRAY1 }} checked={checkedAll} onCheck={onCheckAll} />
      </View>
      {projectId !== undefined && (
        <TouchableOpacity style={[styles.th, { flex: 2, width: 100 }]} onPress={() => onSort('_user_', '_user_')}>
          <Text adjustsFontSizeToFit={true} numberOfLines={2}>
            User
          </Text>
          {sortedName === 'user' && sortedOrder === 'ASCENDING' && (
            <MaterialCommunityIcons name="sort-alphabetical-ascending" size={16} color="black" />
          )}
          {sortedName === 'user' && sortedOrder === 'DESCENDING' && (
            <MaterialCommunityIcons name="sort-alphabetical-descending" size={16} color="black" />
          )}
        </TouchableOpacity>
      )}
      {projectId === undefined && layer.field.length === 0 ? (
        <View style={[styles.th, { width: 60 }]} />
      ) : (
        layer.field.map(({ name, format }, field_index) => (
          <TouchableOpacity
            key={field_index}
            style={[styles.th, { flex: 2, width: 120 }]}
            onPress={() => onSort(name, format)}
          >
            <Text>{name}</Text>
            {sortedName === name && sortedOrder === 'ASCENDING' && (
              <MaterialCommunityIcons name="sort-alphabetical-ascending" size={16} color="black" />
            )}
            {sortedName === name && sortedOrder === 'DESCENDING' && (
              <MaterialCommunityIcons name="sort-alphabetical-descending" size={16} color="black" />
            )}
          </TouchableOpacity>
        ))
      )}
    </View>
  );
});

interface Props_DataTableComponent {
  item: RecordType;
  index: number;
  projectId: string | undefined;
  layer: LayerType;
  checked: boolean;
  changeChecked: (index: number, doCheck: boolean) => void;
  onPress: (index: number) => void;
  changeVisible: (index: number, visible: boolean) => void;
}

const DataTableComponent = React.memo(
  ({ item, index, projectId, layer, checked, changeChecked, onPress, changeVisible }: Props_DataTableComponent) => {
    //console.log('render renderItems');
    //console.log(item);
    return (
      <View style={{ flex: 1, height: 45, flexDirection: 'row' }}>
        <View style={[styles.td, { width: 50 }]}>
          <RectButton2
            name={item.visible ? 'eye' : 'eye-off-outline'}
            onPress={() => changeVisible(index, !item.visible)}
          />
        </View>
        <View style={[styles.td, { width: 60 }]}>
          <Button
            color={COLOR.GRAY4}
            style={{ backgroundColor: COLOR.MAIN }}
            borderRadius={0}
            name={checked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
            onPress={() => changeChecked(index, !checked)}
          />
        </View>

        {projectId !== undefined && (
          <TouchableOpacity style={[styles.td, { flex: 2, width: 100 }]} onPress={() => onPress(index)}>
            <Text adjustsFontSizeToFit={true} numberOfLines={2}>
              {item.displayName}
            </Text>
          </TouchableOpacity>
        )}
        {projectId === undefined && layer.field.length === 0 ? (
          <View style={[styles.td, { width: 60 }]}>
            <Button
              color={COLOR.GRAY4}
              style={{ backgroundColor: COLOR.MAIN }}
              borderRadius={0}
              name={'menu-right'}
              onPress={() => onPress(index)}
            />
          </View>
        ) : (
          layer.field.map(({ name, format }, field_index) => (
            <TouchableOpacity
              key={field_index}
              style={[styles.td, { flex: 2, width: 120 }]}
              onPress={() => onPress(index)}
            >
              <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                {format === 'DATETIME' && item.field[name] !== ''
                  ? dayjs(item.field[name] as string).format('L HH:mm')
                  : format === 'PHOTO'
                  ? `${(item.field[name] as PhotoType[]).length} pic`
                  : format === 'REFERENCE'
                  ? 'Reference'
                  : item.field[name]}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>
    );
  }
);

interface Props_DataItems {
  projectId: string | undefined;
  data: RecordType[];
  layer: LayerType;
  checkList: boolean[];
  onPress: (index: number) => void;
  changeChecked: (index: number, doCheck: boolean) => void;
  changeVisible: (index: number, visible: boolean) => void;
}

const DataItems = React.memo((props: Props_DataItems) => {
  const { projectId, data, layer, checkList, changeChecked, onPress, changeVisible } = props;
  //@ts-ignore
  const renderItem = useCallback(
    ({ item, index }) => (
      <DataTableComponent
        {...{ item, index, projectId, layer, checked: checkList[index], changeChecked, onPress, changeVisible }}
      />
    ),
    [changeChecked, changeVisible, checkList, layer, onPress, projectId]
  );
  const keyExtractor = useCallback((item) => item.id, []);
  return <FlatList data={data} extraData={data} renderItem={renderItem} keyExtractor={keyExtractor} />;
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
});
