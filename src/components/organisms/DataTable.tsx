import React, { useCallback, useContext, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { RecordType, PhotoType, FormatType, LayerType } from '../../types';
import dayjs from '../../i18n/dayjs';
import { DataContext } from '../../contexts/Data';
import { SortOrderType } from '../../utils/Data';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';

// メモ化されたデータ行コンポーネント
const DataRow = React.memo(
  ({
    item,
    getIndex,
    drag,
    isActive,
    checkList,
    projectId,
    layer,
    isMapMemoLayer,
    changeChecked,
    changeVisible,
    gotoDataEdit,
  }: {
    item: RecordType;
    getIndex: () => number | undefined;
    drag: () => void;
    isActive: boolean;
    checkList: { id: number; checked: boolean }[];
    projectId: string | undefined;
    layer: LayerType;
    isMapMemoLayer: boolean;
    changeChecked: (index: number, checked: boolean) => void;
    changeVisible: (item: RecordType) => void;
    gotoDataEdit: (index: number) => void;
  }) => {
    const index = getIndex();
    if (index === undefined) return null;
    const isGroupParent = item.field._group ? item.field._group === '' : true;
    if (!isGroupParent) return null;

    return (
      <View style={{ flex: 1, height: 45, flexDirection: 'row', backgroundColor: isActive ? COLOR.WHITE : COLOR.MAIN }}>
        <View style={[styles.td, { width: 50 }]}>
          <Button
            name={item.visible ? 'eye' : 'eye-off-outline'}
            onPress={() => changeVisible(item)}
            color={COLOR.GRAY4}
            style={{ backgroundColor: COLOR.MAIN }}
          />
        </View>
        <View style={[styles.td, { width: 60 }]}>
          <Button
            color={COLOR.GRAY4}
            style={{ backgroundColor: isActive ? COLOR.WHITE : COLOR.MAIN }}
            borderRadius={0}
            name={checkList[index]?.checked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
            onPress={() => changeChecked(index, !checkList[index].checked)}
            size={20}
          />
        </View>

        {projectId !== undefined && (
          <Pressable
            style={[styles.td, { flex: 2, width: 100 }]}
            onLongPress={drag}
            disabled={isActive}
            onPress={() => gotoDataEdit(index)}
          >
            <Text adjustsFontSizeToFit={true} numberOfLines={2} style={{ textAlign: 'center' }}>
              {item.displayName}
            </Text>
          </Pressable>
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
            <Pressable
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
            </Pressable>
          ))
        )}
        {isMapMemoLayer &&
          //['_group', '_stamp', '_strokeStyle', '_strokeColor', '_strokeWidth', '_zoom']
          ['_strokeColor', '_strokeWidth'].map((name, field_index) => (
            <View key={field_index} style={[styles.td, { flex: 2, width: 120 }]}>
              <Text adjustsFontSizeToFit={true} numberOfLines={2}>
                {item.field[name] === undefined ? '' : (item.field[name] as string)}
              </Text>
            </View>
          ))}
      </View>
    );
  },
  (prevProps, nextProps) => {
    // カスタム比較関数で不要な再レンダリングを防ぐ
    const prevIndex = prevProps.getIndex();
    const nextIndex = nextProps.getIndex();
    if (prevIndex === undefined || nextIndex === undefined) return false;

    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.visible === nextProps.item.visible &&
      prevProps.isActive === nextProps.isActive &&
      prevProps.checkList[prevIndex]?.checked === nextProps.checkList[nextIndex]?.checked
    );
  }
);

export const DataTable = React.memo(() => {
  //console.log(data[0]);
  const {
    sortedRecordSet,
    checkList,
    projectId,
    layer,
    isMapMemoLayer,
    sortedOrder,
    sortedName,
    gotoDataEdit,
    changeChecked,
    changeVisible,
    updateRecordSetOrder,
    changeOrder,
    changeCheckedAll,
    changeVisibleAll,
  } = useContext(DataContext);

  const [checkedAll, setCheckedAll] = useState(false);
  const [visibleAll, setVisibleAll] = useState(true);

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
      changeOrder(colName, sortOrder);
    },
    [changeOrder, sortedName, sortedOrder]
  );
  //@ts-ignore
  const renderItem = useCallback(
    ({ item, getIndex, drag, isActive }: RenderItemParams<RecordType>) => {
      return (
        <DataRow
          item={item}
          getIndex={getIndex}
          drag={drag}
          isActive={isActive}
          checkList={checkList}
          projectId={projectId}
          layer={layer}
          isMapMemoLayer={isMapMemoLayer}
          changeChecked={changeChecked}
          changeVisible={changeVisible}
          gotoDataEdit={gotoDataEdit}
        />
      );
    },
    [changeChecked, changeVisible, checkList, gotoDataEdit, isMapMemoLayer, layer, projectId]
  );
  const keyExtractor = useCallback((item: RecordType) => item.id, []);

  return sortedRecordSet.length !== 0 ? (
    <DraggableFlatList
      // eslint-disable-next-line react/no-unstable-nested-components
      ListHeaderComponent={() => (
        <DataTitle
          isMapMemoLayer={isMapMemoLayer}
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
      data={sortedRecordSet}
      stickyHeaderIndices={[0]}
      initialNumToRender={15}
      removeClippedSubviews={true}
      extraData={checkList} // 変更：必要なデータのみ
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      onDragEnd={({ data }) => updateRecordSetOrder(data)}
      activationDistance={5}
    />
  ) : (
    <DataTitle
      isMapMemoLayer={isMapMemoLayer}
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
  );
});

interface Props {
  isMapMemoLayer: boolean;
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
  const {
    isMapMemoLayer,
    visibleAll,
    onVisibleAll,
    checkedAll,
    onCheckAll,
    onChangeOrder,
    sortedName,
    sortedOrder,
    projectId,
    layer,
  } = props;

  return (
    <View style={{ flexDirection: 'row', height: 45 }}>
      <View style={[styles.th, { width: 50 }]}>
        <Button
          name={visibleAll ? 'eye' : 'eye-off-outline'}
          size={20}
          onPress={onVisibleAll}
          color={COLOR.GRAY4}
          style={{ backgroundColor: COLOR.GRAY1 }}
        />
      </View>
      <View style={[styles.th, { width: 60 }]}>
        <Button
          color={COLOR.GRAY4}
          style={{ backgroundColor: COLOR.GRAY1 }}
          borderRadius={0}
          name={checkedAll ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
          onPress={onCheckAll}
          size={22}
        />
      </View>
      {projectId !== undefined && (
        <Pressable style={[styles.th, { flex: 2, width: 100 }]} onPress={() => onChangeOrder('_user_', '_user_')}>
          <Text adjustsFontSizeToFit={true} numberOfLines={2}>
            User
          </Text>
          {sortedName === '_user_' && sortedOrder === 'ASCENDING' && (
            <MaterialCommunityIcons name="sort-alphabetical-ascending" size={16} color="black" />
          )}
          {sortedName === '_user_' && sortedOrder === 'DESCENDING' && (
            <MaterialCommunityIcons name="sort-alphabetical-descending" size={16} color="black" />
          )}
        </Pressable>
      )}
      {projectId === undefined && layer.field.length === 0 ? (
        <View style={[styles.th, { width: 60 }]} />
      ) : (
        layer.field.map(({ name, format }, field_index) => (
          <Pressable
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
          </Pressable>
        ))
      )}
      {isMapMemoLayer &&
        //['_group', '_stamp', '_strokeStyle', '_strokeColor', '_strokeWidth', '_zoom']
        ['_strokeColor', '_strokeWidth'].map((name, field_index) => (
          <View key={field_index} style={[styles.th, { flex: 2, width: 120 }]}>
            <Text>{name}</Text>
          </View>
        ))}
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
