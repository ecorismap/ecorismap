import React, { useCallback, useContext, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { Button, RectButton2 } from '../atoms';
import { CheckBox } from '../molecules/CheckBox';
import { RecordType, PhotoType } from '../../types';
import dayjs from '../../i18n/dayjs';
import { DataContext } from '../../contexts/Data';

export const DataTable = React.memo(() => {
  //console.log(data[0]);

  return (
    <View style={{ flexDirection: 'column', flex: 1, marginBottom: 10 }}>
      <DataTitle />
      <DataItems />
    </View>
  );
});

const DataTitle = React.memo(() => {
  const { projectId, layer, sortedOrder, sortedName, changeOrder, changeChecked, changeVisible } =
    useContext(DataContext);
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
        <TouchableOpacity style={[styles.th, { flex: 2, width: 100 }]} onPress={() => changeOrder('_user_', '_user_')}>
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
            onPress={() => changeOrder(name, format)}
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
  checked: boolean;
}

const DataTableComponent = React.memo(({ item, index, checked }: Props_DataTableComponent) => {
  const { projectId, layer, gotoDataEdit, changeChecked, changeVisible } = useContext(DataContext);
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
        <TouchableOpacity style={[styles.td, { flex: 2, width: 100 }]} onPress={() => gotoDataEdit(index)}>
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
            onPress={() => gotoDataEdit(index)}
          />
        </View>
      ) : (
        layer.field.map(({ name, format }, field_index) => (
          <TouchableOpacity
            key={field_index}
            style={[styles.td, { flex: 2, width: 120 }]}
            onPress={() => gotoDataEdit(index)}
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
});

const DataItems = React.memo(() => {
  const { data, checkList } = useContext(DataContext);
  //@ts-ignore
  const renderItem = useCallback(
    ({ item, index }) => <DataTableComponent {...{ item, index, checked: checkList[index] }} />,
    [checkList]
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
