import React, { useCallback, useContext, useState, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { RecordType, PhotoType, FormatType, LayerType } from '../../types';
import dayjs from '../../i18n/dayjs';
import { DataContext } from '../../contexts/Data';
import { SortOrderType } from '../../utils/Data';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ドラッグ可能なデータ行コンポーネント
const SortableDataRow = React.memo(
  ({
    item,
    index,
    checkList,
    projectId,
    layer,
    isMapMemoLayer,
    changeChecked,
    changeVisible,
    gotoDataEdit,
  }: {
    item: RecordType;
    index: number;
    checkList: { id: number; checked: boolean }[];
    projectId: string | undefined;
    layer: LayerType;
    isMapMemoLayer: boolean;
    changeChecked: (index: number, checked: boolean) => void;
    changeVisible: (item: RecordType) => void;
    gotoDataEdit: (index: number) => void;
  }) => {
    const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const isGroupParent = item.field._group ? item.field._group === '' : true;
    if (!isGroupParent) return null;

    return (
      <div ref={setNodeRef} style={style}>
        <View style={{ flex: 1, height: 45, flexDirection: 'row', backgroundColor: isDragging ? COLOR.WHITE : COLOR.MAIN }}>
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
              style={{ backgroundColor: isDragging ? COLOR.WHITE : COLOR.MAIN }}
              borderRadius={0}
              name={checkList[index]?.checked ? 'checkbox-marked-outline' : 'checkbox-blank-outline'}
              onPress={() => changeChecked(index, !checkList[index]?.checked)}
              size={20}
            />
          </View>

          {projectId !== undefined && layer.permission !== 'COMMON' && (
            <Pressable
              style={[styles.td, { flex: 2, width: 100, cursor: 'grab' } as any]}
              onPress={() => gotoDataEdit(index)}
              {...listeners}
            >
              <Text numberOfLines={2} style={{ textAlign: 'center' }}>
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
                style={[styles.td, { flex: 2, width: 120, cursor: 'grab' } as any]}
                onPress={() => gotoDataEdit(index)}
                {...listeners}
              >
                <Text numberOfLines={2}>
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
            ['_strokeColor', '_strokeWidth'].map((name, field_index) => (
              <View key={field_index} style={[styles.td, { flex: 2, width: 120 }]}>
                <Text numberOfLines={2}>
                  {item.field[name] === undefined ? '' : (item.field[name] as string)}
                </Text>
              </View>
            ))}
        </View>
      </div>
    );
  },
  (prevProps, nextProps) => {
    const isItemEqual =
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.visible === nextProps.item.visible &&
      prevProps.item.displayName === nextProps.item.displayName &&
      prevProps.item.updatedAt === nextProps.item.updatedAt;

    return (
      isItemEqual &&
      prevProps.index === nextProps.index &&
      prevProps.checkList[prevProps.index]?.checked === nextProps.checkList[nextProps.index]?.checked
    );
  }
);

export const DataTable = React.memo(() => {
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = sortedRecordSet.findIndex((record) => record.id === active.id);
        const newIndex = sortedRecordSet.findIndex((record) => record.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newData = arrayMove(sortedRecordSet, oldIndex, newIndex);
          updateRecordSetOrder(newData);
        }
      }
    },
    [sortedRecordSet, updateRecordSetOrder]
  );

  const itemIds = useMemo(() => sortedRecordSet.map((record) => record.id), [sortedRecordSet]);

  return sortedRecordSet.length !== 0 ? (
    <View style={styles.container}>
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
      {/* @ts-ignore - dnd-kit is not compatible with React 19 types */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        {/* @ts-ignore - dnd-kit is not compatible with React 19 types */}
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {sortedRecordSet.map((item, index) => {
            const isGroupParent = item.field._group ? item.field._group === '' : true;
            if (!isGroupParent) return null;
            return (
              <SortableDataRow
                key={item.id}
                item={item}
                index={index}
                checkList={checkList}
                projectId={projectId}
                layer={layer}
                isMapMemoLayer={isMapMemoLayer}
                changeChecked={changeChecked}
                changeVisible={changeVisible}
                gotoDataEdit={gotoDataEdit}
              />
            );
          })}
        </SortableContext>
      </DndContext>
    </View>
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
      {projectId !== undefined && layer.permission !== 'COMMON' && (
        <Pressable style={[styles.th, { flex: 2, width: 100 }]} onPress={() => onChangeOrder('_user_', '_user_')}>
          <Text numberOfLines={2}>
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
        ['_strokeColor', '_strokeWidth'].map((name, field_index) => (
          <View key={field_index} style={[styles.th, { flex: 2, width: 120 }]}>
            <Text>{name}</Text>
          </View>
        ))}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderColor: COLOR.GRAY2,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  th: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderColor: COLOR.GRAY2,
    borderRightWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
});
