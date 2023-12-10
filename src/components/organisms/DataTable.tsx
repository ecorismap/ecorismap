import React, { useCallback, useContext, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { Button, RectButton2 } from '../atoms';
import { CheckBox } from '../molecules/CheckBox';
import { RecordType, PhotoType, FormatType, LayerType } from '../../types';
import dayjs from '../../i18n/dayjs';
import { DataContext } from '../../contexts/Data';
import { SortOrderType } from '../../utils/Data';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';

export const DataTable = React.memo(() => {
  //console.log(data[0]);
  const {
    data,
    checkList,
    projectId,
    layer,
    gotoDataEdit,
    changeChecked,
    changeVisible,
    updateOwnRecordSetOrder,
    changeOrder,
    changeCheckedAll,
    changeVisibleAll,
  } = useContext(DataContext);

  const [checkedAll, setCheckedAll] = useState(false);
  const [visibleAll, setVisibleAll] = useState(true);
  const [sortedOrder, setSortedOrder] = useState<SortOrderType>('UNSORTED');
  const [sortedName, setSortedName] = useState<string>('');

  const onCheckAll = useCallback(() => {
    setCheckedAll(!checkedAll);
    changeCheckedAll(!checkedAll);
  }, [changeCheckedAll, checkedAll]);

  const onVisibleAll = useCallback(() => {
    setVisibleAll(!visibleAll);
    changeVisibleAll(!visibleAll);
  }, [changeVisibleAll, visibleAll]);

  const onChangeOrder = useCallback(
    (colName: string, format: FormatType | '_user_') => {
      if (format === 'PHOTO') return;
      const sortOrder =
        colName === sortedName
          ? sortedOrder === 'UNSORTED'
            ? 'DESCENDING'
            : sortedOrder === 'DESCENDING'
            ? 'ASCENDING'
            : 'UNSORTED'
          : 'DESCENDING';
      setSortedName(colName);
      setSortedOrder(sortOrder);
      changeOrder(colName, sortOrder);
    },
    [changeOrder, sortedName, sortedOrder]
  );
  //@ts-ignore
  const renderItem = useCallback(
    ({ item, getIndex, drag, isActive }: RenderItemParams<RecordType>) => {
      const index = getIndex();
      if (index === undefined) return null;
      return (
        <View
          style={{ flex: 1, height: 45, flexDirection: 'row', backgroundColor: isActive ? COLOR.WHITE : COLOR.MAIN }}
        >
          <View style={[styles.td, { width: 50 }]}>
            <RectButton2 name={item.visible ? 'eye' : 'eye-off-outline'} onPress={() => changeVisible(item)} />
          </View>
          <View style={[styles.td, { width: 60 }]}>
            <Button
              color={COLOR.GRAY4}
              style={{ backgroundColor: isActive ? COLOR.WHITE : COLOR.MAIN }}
              borderRadius={0}
              name={checkList[index] ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
              onPress={() => changeChecked(index, !checkList[index])}
            />
          </View>

          {projectId !== undefined && (
            <TouchableOpacity
              style={[styles.td, { flex: 2, width: 100 }]}
              onLongPress={drag}
              disabled={isActive}
              onPress={() => gotoDataEdit(index)}
            >
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
                onLongPress={drag}
                disabled={isActive}
                onPress={() => gotoDataEdit(index)}
              >
                <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                  {item.field[name] === undefined
                    ? ''
                    : format === 'DATETIME'
                    ? `${dayjs(item.field[name] as string).format('L HH:mm')}`
                    : format === 'PHOTO'
                    ? `${(item.field[name] as PhotoType[]).length} pic`
                    : format === 'REFERENCE'
                    ? 'Reference'
                    : `${item.field[name]}`}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      );
    },
    [changeChecked, changeVisible, checkList, gotoDataEdit, layer.field, projectId]
  );
  const keyExtractor = useCallback((item: RecordType) => item.id, []);

  return (
    <View style={{ flex: 1, flexDirection: 'column', marginBottom: 10 }}>
      {data.length !== 0 ? (
        <DraggableFlatList
          data={data}
          stickyHeaderIndices={[0]}
          initialNumToRender={15}
          extraData={data}
          // eslint-disable-next-line react/no-unstable-nested-components
          ListHeaderComponent={() => (
            <DataTitle
              visibleAll={visibleAll}
              onVisibleAll={onVisibleAll}
              checkedAll={checkedAll}
              onCheckAll={onCheckAll}
              onChangeOrder={onChangeOrder}
              sortedName={sortedName}
              sortedOrder={sortedOrder}
              projectId={projectId}
              layer={layer}
            />
          )}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          removeClippedSubviews={true}
          disableVirtualization={true}
          // eslint-disable-next-line @typescript-eslint/no-shadow
          onDragEnd={({ data }) => updateOwnRecordSetOrder(data)}
          activationDistance={5}
        />
      ) : (
        <DataTitle
          visibleAll={visibleAll}
          onVisibleAll={onVisibleAll}
          checkedAll={checkedAll}
          onCheckAll={onCheckAll}
          onChangeOrder={onChangeOrder}
          sortedName={sortedName}
          sortedOrder={sortedOrder}
          projectId={projectId}
          layer={layer}
        />
      )}
    </View>
  );
});

interface Props {
  visibleAll: boolean;
  onVisibleAll: () => void;
  checkedAll: boolean;
  onCheckAll: () => void;
  onChangeOrder: (colName: string, format: FormatType | '_user_') => void;
  sortedName: string;
  sortedOrder: SortOrderType;
  projectId: string | undefined;
  layer: LayerType;
}

const DataTitle = React.memo((props: Props) => {
  //propsから変数を取り出す
  const { visibleAll, onVisibleAll, checkedAll, onCheckAll, onChangeOrder, sortedName, sortedOrder, projectId, layer } =
    props;
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
        <TouchableOpacity
          style={[styles.th, { flex: 2, width: 100 }]}
          onPress={() => onChangeOrder('_user_', '_user_')}
        >
          <Text adjustsFontSizeToFit={true} numberOfLines={2}>
            User
          </Text>
          {sortedName === '_user_' && sortedOrder === 'ASCENDING' && (
            <MaterialCommunityIcons name="sort-alphabetical-ascending" size={16} color="black" />
          )}
          {sortedName === '_user_' && sortedOrder === 'DESCENDING' && (
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
            onPress={() => onChangeOrder(name, format)}
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

const styles = StyleSheet.create({
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    //flex: 1,
    flexDirection: 'row',
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
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
});
