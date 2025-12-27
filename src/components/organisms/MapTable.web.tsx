import React, { useContext, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { Button } from '../atoms';
import { Pressable } from '../atoms/Pressable';
import { MapsContext } from '../../contexts/Maps';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { t } from 'i18next';

// タイトル行
const MapTableTitle = () => (
  <View style={{ flexDirection: 'row', height: 45 }}>
    <View style={[styles.th, { flex: 1, width: 80 }]}>
      <Text>{t('common.visible')}</Text>
    </View>
    <View style={[styles.th, { flex: 6 }]}>
      <Text>{t('common.name')}</Text>
    </View>

    <View style={[styles.th, { flex: 2, width: 80 }]}>
      <Text>{t('common.move')}</Text>
    </View>
  </View>
);

// ドラッグ可能な行コンポーネント
const SortableMapRow = React.memo(
  ({
    item,
    changeVisible,
    pressDownloadMap,
    gotoMapEdit,
    jumpToBoundary,
    changeExpand,
    pressMapOrder,
  }: {
    item: any;
    changeVisible: (visible: boolean, item: any) => void;
    pressDownloadMap: (item: any) => void;
    gotoMapEdit: (item: any) => void;
    jumpToBoundary: (item: any) => void;
    changeExpand: (expanded: boolean, item: any) => void;
    pressMapOrder: (item: any, direction: 'up' | 'down') => void;
  }) => {
    const isGroupExpanded = item.isGroup && item.expanded;
    const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: item.id,
      disabled: isGroupExpanded,
    });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
    };

    const backgroundColor = isDragging
      ? COLOR.WHITE
      : item.isGroup
      ? COLOR.KHAKI
      : item.groupId
      ? COLOR.LIGHTKHAKI
      : COLOR.MAIN;

    return (
      <div ref={setNodeRef} style={style}>
        <View style={[styles.tr, { backgroundColor }]}>
          <View
            style={[
              styles.td,
              {
                flex: 1,
                width: 80,
                borderRightWidth: item.groupId ? 1 : 0,
                borderColor: COLOR.GRAY1,
              },
            ]}
          >
            <View style={{ alignItems: 'center', height: 56, justifyContent: 'center', flex: 1 }}>
              {item.isGroup ? (
                <Button
                  name={item.expanded ? 'chevron-down' : 'chevron-right'}
                  onPress={() => changeExpand(!item.expanded, item)}
                  color={COLOR.GRAY4}
                  size={25}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor }}
                />
              ) : (
                <Button
                  name={item.visible ? 'eye' : 'eye-off-outline'}
                  onPress={() => changeVisible(!item.visible, item)}
                  color={COLOR.GRAY4}
                  size={25}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor }}
                />
              )}
            </View>
          </View>
          <Pressable
            style={[styles.td, { flex: 4, cursor: 'grab' } as any]}
            onPress={() => {
              if (item.isGroup) {
                changeExpand(!item.expanded, item);
              } else {
                jumpToBoundary(item);
              }
            }}
            {...listeners}
          >
            <View style={{ flex: 1 }}>
              <Text>{item.name}</Text>
            </View>
          </Pressable>
          <View style={[styles.td, { flex: 1, width: 80 }]}>
            {item.id !== 'standard' &&
              item.id !== 'hybrid' &&
              !item.isGroup &&
              (item.url.endsWith('.pdf') || item.url.startsWith('pdf://')) && (
                <Button
                  name="download"
                  onPress={() => pressDownloadMap(item)}
                  borderRadius={5}
                  backgroundColor={COLOR.GRAY3}
                  size={18}
                  labelText={t('Maps.label.pdf')}
                />
              )}
          </View>
          <View style={[styles.td, { flex: 1, width: 80 }]}>
            {item.id !== 'standard' && item.id !== 'hybrid' && (
              <Button
                name="pencil"
                onPress={() => gotoMapEdit(item)}
                backgroundColor={COLOR.GRAY3}
                size={18}
                labelText={t('Maps.label.edit')}
                borderRadius={5}
              />
            )}
          </View>
          <View style={[styles.td, { flex: 2, width: 80, flexDirection: 'row', justifyContent: 'center' }]}>
            {item.id !== 'standard' && item.id !== 'hybrid' && (
              <>
                <Button
                  name="chevron-up"
                  onPress={() => pressMapOrder(item, 'up')}
                  color={COLOR.GRAY2}
                  style={{ backgroundColor }}
                />
                <Button
                  name="chevron-down"
                  onPress={() => pressMapOrder(item, 'down')}
                  color={COLOR.GRAY2}
                  style={{ backgroundColor }}
                />
              </>
            )}
          </View>
        </View>
      </div>
    );
  }
);

export const MapTable = React.memo(() => {
  const {
    filterdMaps,
    changeVisible,
    pressDownloadMap,
    gotoMapEdit,
    jumpToBoundary,
    changeExpand,
    pressMapOrder,
    updateMapOrder,
    onDragBegin,
  } = useContext(MapsContext);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (over && active.id !== over.id) {
        const oldIndex = filterdMaps.findIndex((map: any) => map.id === active.id);
        const newIndex = filterdMaps.findIndex((map: any) => map.id === over.id);

        if (oldIndex !== -1 && newIndex !== -1) {
          updateMapOrder(filterdMaps, oldIndex, newIndex > oldIndex ? newIndex + 1 : newIndex);
        }
      }
    },
    [filterdMaps, updateMapOrder]
  );

  const handleDragStart = useCallback(
    (event: { active: { id: string | number } }) => {
      const map = filterdMaps.find((m: any) => m.id === event.active.id);
      if (map) {
        onDragBegin(map);
      }
    },
    [filterdMaps, onDragBegin]
  );

  const itemIds = useMemo(() => filterdMaps.map((map: any) => map.id), [filterdMaps]);

  return (
    <View style={styles.container}>
      <MapTableTitle />
      {/* @ts-ignore - dnd-kit is not compatible with React 19 types */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} onDragStart={handleDragStart}>
        {/* @ts-ignore - dnd-kit is not compatible with React 19 types */}
        <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
          {filterdMaps.map((item: any) => (
            <SortableMapRow
              key={item.id}
              item={item}
              changeVisible={changeVisible}
              pressDownloadMap={pressDownloadMap}
              gotoMapEdit={gotoMapEdit}
              jumpToBoundary={jumpToBoundary}
              changeExpand={changeExpand}
              pressMapOrder={pressMapOrder}
            />
          ))}
        </SortableContext>
      </DndContext>
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
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
  tr: {
    flexDirection: 'row',
    height: 60,
  },
  th: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderColor: COLOR.GRAY2,
    borderRightWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 0,
  },
});
