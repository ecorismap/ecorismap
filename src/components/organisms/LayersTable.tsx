import React, { useCallback, useContext, useEffect, useState } from 'react';
import { View, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DraggableFlatList, { RenderItemParams } from 'react-native-draggable-flatlist';
import { COLOR } from '../../constants/AppConstants';
import { Picker, PointView, LineView, PolygonView, Button, TextInput } from '../atoms';
import { t } from '../../i18n/config';
import { LayersContext } from '../../contexts/Layers';
import { LayerType } from '../../types';
import { Pressable } from '../atoms/Pressable';
import { useProject } from '../../hooks/useProject';

export const LayersTable = React.memo(() => {
  const {
    filterdLayers,
    changeExpand,
    changeVisible,
    changeLabel,
    changeCustomLabel,
    changeActiveLayer,
    updateLayersOrder,
    gotoData,
    gotoLayerEdit,
    gotoColorStyle,
    pressLayerOrder,
    onDragBegin,
  } = useContext(LayersContext);
  const { isSettingProject } = useProject();
  const hasCustomLabel = filterdLayers.some((layer) => layer.label === t('common.custom'));
  const [customLabel, setCustomLabel] = useState<{ [key: string]: string }>({});

  const handleCustomLabel = useCallback((id: string, value: string) => {
    setCustomLabel((prev) => ({ ...prev, [id]: value }));
  }, []);

  useEffect(() => {
    setCustomLabel(filterdLayers.reduce((obj, layer) => ({ ...obj, [layer.id]: layer.customLabel }), {}));
  }, [filterdLayers]);

  const renderItem = useCallback(
    ({ item, drag, isActive }: RenderItemParams<LayerType>) => {
      const backgroundColor = isActive
        ? COLOR.WHITE
        : item.type === 'LAYERGROUP'
        ? COLOR.KHAKI
        : item.groupId
        ? COLOR.LIGHTKHAKI
        : COLOR.MAIN;

      // ラベル候補作成
      const labelNames = [
        ...item.field.reduce((a, b) => (b.format !== 'PHOTO' ? [...a, b.name] : a), [t('common.none')]),
        t('common.custom'),
      ];
      const labelValues = [
        ...item.field.reduce((a, b) => (b.format !== 'PHOTO' ? [...a, b.name] : a), ['']),
        t('common.custom'),
      ];

      return (
        <View style={[styles.row, { backgroundColor: backgroundColor }]}>
          <View style={[styles.td, { flex: 2, width: 60 }]}>
            {item.type === 'LAYERGROUP' ? (
              <Button
                name={item.expanded ? 'chevron-down' : 'chevron-right'}
                onPress={() => changeExpand(item)}
                style={[styles.iconBtn, { backgroundColor }]}
                color={COLOR.GRAY4}
              />
            ) : (
              (isSettingProject || (item.permission !== 'COMMON' && item.id !== 'track')) && (
                <Button
                  name={item.active ? 'square-edit-outline' : 'checkbox-blank-outline'}
                  onPress={() => changeActiveLayer(item)}
                  color={COLOR.GRAY3}
                  style={[styles.iconBtn, { backgroundColor }]}
                />
              )
            )}
          </View>

          <View style={[styles.td, { flex: 3, width: 100 }]}>
            <Button
              name={item.visible ? 'eye' : 'eye-off-outline'}
              onPress={() => changeVisible(!item.visible, item)}
              color={COLOR.GRAY4}
              style={[styles.iconBtn, { backgroundColor }]}
            />
            {item.type === 'POINT' && (
              <Pressable onPress={() => gotoColorStyle(item)}>
                <PointView style={styles.symbol} color={item.colorStyle.color} size={20} borderColor={COLOR.WHITE} />
              </Pressable>
            )}
            {item.type === 'LINE' && (
              <Pressable onPress={() => gotoColorStyle(item)}>
                <LineView style={styles.symbol} color={item.colorStyle.color} />
              </Pressable>
            )}
            {item.type === 'POLYGON' && (
              <Pressable onPress={() => gotoColorStyle(item)}>
                <PolygonView style={styles.symbol} color={item.colorStyle.color} />
              </Pressable>
            )}
            {(item.type === 'NONE' || item.type === 'LAYERGROUP') && (
              <LineView style={{ marginLeft: 10, transform: [{ scale: 0.0 }] }} color={COLOR.MAIN} />
            )}
          </View>

          <Pressable
            style={[styles.td, { flex: 5, width: 150 }]}
            onLongPress={drag}
            disabled={isActive}
            onPress={() => item.type !== 'LAYERGROUP' && gotoData(item)}
          >
            <Text style={styles.nameText} numberOfLines={2} adjustsFontSizeToFit>
              {item.name}
            </Text>
            {item.type !== 'LAYERGROUP' && (
              <MaterialCommunityIcons
                name="chevron-right"
                size={16}
                color={COLOR.GRAY3}
                style={styles.chevron}
                selectable={undefined}
              />
            )}
          </Pressable>

          <View style={[styles.td, { flex: 5, width: 160 }]}>
            {item.type !== 'LAYERGROUP' && (
              <Picker
                selectedValue={item.label}
                onValueChange={(val) => changeLabel(item, val as string)}
                itemLabelArray={labelNames}
                itemValueArray={labelValues}
                maxIndex={labelValues.length - 1}
                style={{ backgroundColor }}
              />
            )}
          </View>

          {hasCustomLabel && (
            <View style={[styles.td, { flex: 5, width: 160 }]}>
              {item.label === t('common.custom') && (
                <TextInput
                  placeholder={'field1|field2'}
                  placeholderTextColor={COLOR.GRAY3}
                  value={customLabel[item.id]}
                  onChangeText={(v: string) => handleCustomLabel(item.id, v)}
                  onBlur={() => changeCustomLabel(item, customLabel[item.id])}
                  style={styles.input}
                />
              )}
            </View>
          )}

          <View style={[styles.td, { flex: 2, width: 60 }]}>
            {item.id !== 'track' && (
              <Button
                name="table-cog"
                onPress={() => gotoLayerEdit(item)}
                style={{ backgroundColor }}
                color={COLOR.GRAY4}
              />
            )}
          </View>

          {/* 上下移動ボタン */}
          <View style={[styles.td, { flex: 3, width: 80, flexDirection: 'row', justifyContent: 'center' }]}>
            {/* 上へ */}
            <Button
              name="chevron-up"
              onPress={() => pressLayerOrder(item, 'up')}
              color={COLOR.GRAY2}
              style={[styles.iconBtn, { backgroundColor }]}
            />
            {/* 下へ */}
            <Button
              name="chevron-down"
              onPress={() => pressLayerOrder(item, 'down')}
              color={COLOR.GRAY2}
              style={[styles.iconBtn, { backgroundColor }]}
            />
          </View>
        </View>
      );
    },
    [
      isSettingProject,
      hasCustomLabel,
      customLabel,
      changeExpand,
      changeActiveLayer,
      changeVisible,
      gotoColorStyle,
      gotoData,
      changeLabel,
      handleCustomLabel,
      changeCustomLabel,
      gotoLayerEdit,
      pressLayerOrder,
    ]
  );

  const keyExtractor = useCallback((item: LayerType) => item.id, []);

  return (
    // @ts-ignore - react-native-draggable-flatlist is not compatible with React 19 types
    <DraggableFlatList<LayerType>
      data={filterdLayers}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={<LayersTitle hasCustomLabel={hasCustomLabel} />}
      stickyHeaderIndices={[0]}
      initialNumToRender={filterdLayers.length}
      removeClippedSubviews
      activationDistance={5}
      onDragBegin={(index) => onDragBegin(filterdLayers[index])}
      onDragEnd={({ from, to }) => updateLayersOrder(filterdLayers, from, to > from ? to + 1 : to)}
    />
  );
});

const LayersTitle = React.memo((props: { hasCustomLabel: boolean }) => {
  const { hasCustomLabel } = props;
  return (
    <View style={{ flexDirection: 'row', height: 45 }}>
      <View style={[styles.th, { flex: 2, width: 60 }]}>
        <Text>{`${t('common.edit')}`}</Text>
      </View>
      <View style={[styles.th, { flex: 3, width: 100 }]}>
        <Text>{`${t('common.visible')}`}</Text>
      </View>
      <View style={[styles.th, { flex: 5, width: 150 }]}>
        <Text>{`${t('common.layerName')}`}</Text>
      </View>
      <View style={[styles.th, { flex: 5, width: 160 }]}>
        <Text>{`${t('common.label')}`}</Text>
      </View>
      {hasCustomLabel && (
        <View style={[styles.th, { flex: 5, width: 160 }]}>
          <Text>{`${t('common.customLabel')}`}</Text>
        </View>
      )}
      <View style={[styles.th, { flex: 2, width: 60 }]}>
        <Text>{`${t('common.layerSetting')}`}</Text>
      </View>
      <View style={[styles.th, { flex: 3, width: 80 }]}>
        <Text>{`${t('common.move')}`}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    height: 60,
  },
  td: {
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: COLOR.GRAY2,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 5,
  },
  th: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderBottomColor: COLOR.GRAY2,
    borderRightColor: COLOR.GRAY2,
    borderRightWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  iconBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbol: {
    margin: 3,
    transform: [{ scale: 0.6 }],
  },
  nameText: {
    flex: 4,
    padding: 5,
    textAlign: 'center',
  },
  chevron: {
    flex: 1,
    marginHorizontal: 2,
  },
  input: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 5,
    flex: 1,
    fontSize: 16,
    marginVertical: 10,
    paddingHorizontal: 10,
  },
});
