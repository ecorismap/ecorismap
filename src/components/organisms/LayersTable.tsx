import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
import { usePermission } from '../../hooks/usePermission';

// メモ化されたレイヤー行コンポーネント
const LayerRow = React.memo(
  ({
    item,
    drag,
    isActive,
    isClosedProject,
    isSettingProject,
    hasCustomLabel,
    customLabelValue,
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
  }: {
    item: LayerType;
    drag: () => void;
    isActive: boolean;
    isClosedProject: boolean;
    isSettingProject: boolean;
    hasCustomLabel: boolean;
    customLabelValue: string;
    changeExpand: (layer: LayerType) => void;
    changeActiveLayer: (layer: LayerType) => void;
    changeVisible: (visible: boolean, layer: LayerType) => void;
    gotoColorStyle: (layer: LayerType) => void;
    gotoData: (layer: LayerType) => void;
    changeLabel: (layer: LayerType, label: string) => void;
    handleCustomLabel: (id: string, value: string) => void;
    changeCustomLabel: (layer: LayerType, customLabel: string) => void;
    gotoLayerEdit: (layer: LayerType) => void;
    pressLayerOrder: (layer: LayerType, direction: 'up' | 'down') => void;
  }) => {
    const isParent = item.type === 'LAYERGROUP';
    const backgroundColor = isActive
      ? COLOR.WHITE
      : isParent
      ? COLOR.GROUP_PARENT_BG
      : item.groupId
      ? COLOR.GROUP_CHILD_BG
      : COLOR.MAIN;
    // 親行の文字・アイコン色。ドラッグ中は白背景になるため濃色に戻す
    const parentFg = isActive ? COLOR.GRAY4 : COLOR.WHITE;

    // ラベル候補作成をメモ化
    const { labelNames, labelValues } = useMemo(() => {
      const names = [
        ...item.field.reduce((a, b) => (b.format !== 'PHOTO' ? [...a, b.name] : a), [t('common.none')] as string[]),
        t('common.custom'),
      ];
      const values = [
        ...item.field.reduce((a, b) => (b.format !== 'PHOTO' ? [...a, b.name] : a), [''] as string[]),
        t('common.custom'),
      ];
      return { labelNames: names, labelValues: values };
    }, [item.field]);

    return (
      <View style={[styles.row, { backgroundColor: backgroundColor }]}>
        {!!item.groupId && !isActive && <View style={styles.childAccent} />}
        <View style={[styles.td, { flex: 2, width: 60 }]}>
          {isParent ? (
            <Button
              name={item.expanded ? 'chevron-down' : 'chevron-right'}
              onPress={() => changeExpand(item)}
              style={[styles.iconBtn, { backgroundColor }]}
              color={parentFg}
            />
          ) : (
            (isClosedProject || isSettingProject || item.permission !== 'COMMON') &&
            item.id !== 'track' && (
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
            color={isParent ? parentFg : COLOR.GRAY4}
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
          // グループ親はラベル列を表示しないため、レイヤ名+ラベルの2列分の幅を使う
          style={[styles.td, isParent ? { flex: 10, width: 310 } : { flex: 5, width: 150 }, { height: 60 }]}
          onLongPress={item.type === 'LAYERGROUP' && item.expanded ? undefined : drag}
          disabled={isActive}
          onPress={() => (item.type === 'LAYERGROUP' ? changeExpand(item) : gotoData(item))}
        >
          {isParent ? (
            <View style={styles.groupName}>
              <MaterialCommunityIcons
                name={item.expanded ? 'folder-open' : 'folder'}
                size={18}
                color={parentFg}
                style={{ marginRight: 6 }}
                selectable={undefined}
              />
              <Text style={{ color: parentFg, flexShrink: 1, fontWeight: 'bold' }} numberOfLines={2}>
                {item.name}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.nameText} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.5}>
                {item.name}
              </Text>
              <MaterialCommunityIcons
                name="chevron-right"
                size={16}
                color={COLOR.GRAY3}
                style={styles.chevron}
                selectable={undefined}
              />
            </>
          )}
        </Pressable>

        {!isParent && (
          <View style={[styles.td, { flex: 5, width: 160 }]}>
            <Picker
              selectedValue={item.label}
              onValueChange={(val) => changeLabel(item, val as string)}
              itemLabelArray={labelNames}
              itemValueArray={labelValues}
              maxIndex={labelValues.length - 1}
              style={{ backgroundColor }}
            />
          </View>
        )}

        {hasCustomLabel && (
          <View style={[styles.td, { flex: 5, width: 160 }]}>
            {item.label === t('common.custom') && (
              <TextInput
                placeholder={'field1|field2'}
                placeholderTextColor={COLOR.GRAY3}
                value={customLabelValue}
                onChangeText={(v: string) => handleCustomLabel(item.id, v)}
                onBlur={() => changeCustomLabel(item, customLabelValue)}
                style={[styles.input, { backgroundColor }]}
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
              color={isParent ? parentFg : COLOR.GRAY4}
            />
          )}
        </View>

        {/* 上下移動ボタン */}
        <View style={[styles.td, { flex: 3, width: 80, flexDirection: 'row', justifyContent: 'center' }]}>
          {/* 上へ */}
          <Button
            name="chevron-up"
            onPress={() => pressLayerOrder(item, 'up')}
            color={isParent ? parentFg : COLOR.GRAY2}
            style={[styles.iconBtn, { backgroundColor }]}
          />
          {/* 下へ */}
          <Button
            name="chevron-down"
            onPress={() => pressLayerOrder(item, 'down')}
            color={isParent ? parentFg : COLOR.GRAY2}
            style={[styles.iconBtn, { backgroundColor }]}
          />
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    // カスタム比較関数: trueを返すと再レンダリングをスキップ
    return (
      prevProps.item.id === nextProps.item.id &&
      prevProps.item.visible === nextProps.item.visible &&
      prevProps.item.active === nextProps.item.active &&
      prevProps.item.expanded === nextProps.item.expanded &&
      prevProps.item.label === nextProps.item.label &&
      prevProps.item.name === nextProps.item.name &&
      prevProps.item.colorStyle.color === nextProps.item.colorStyle.color &&
      prevProps.isActive === nextProps.isActive &&
      prevProps.hasCustomLabel === nextProps.hasCustomLabel &&
      prevProps.customLabelValue === nextProps.customLabelValue
    );
  }
);

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
  const { isClosedProject } = usePermission();
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
      return (
        <LayerRow
          item={item}
          drag={drag}
          isActive={isActive}
          isClosedProject={isClosedProject}
          isSettingProject={isSettingProject}
          hasCustomLabel={hasCustomLabel}
          customLabelValue={customLabel[item.id] || ''}
          changeExpand={changeExpand}
          changeActiveLayer={changeActiveLayer}
          changeVisible={changeVisible}
          gotoColorStyle={gotoColorStyle}
          gotoData={gotoData}
          changeLabel={changeLabel}
          handleCustomLabel={handleCustomLabel}
          changeCustomLabel={changeCustomLabel}
          gotoLayerEdit={gotoLayerEdit}
          pressLayerOrder={pressLayerOrder}
        />
      );
    },
    [
      isClosedProject,
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

  // ListHeaderComponentをメモ化（不要な再マウントを防止）
  const ListHeader = useMemo(() => <LayersTitle hasCustomLabel={hasCustomLabel} />, [hasCustomLabel]);

  return (
    // @ts-ignore - react-native-draggable-flatlist is not compatible with React 19 types
    <DraggableFlatList<LayerType>
      data={filterdLayers}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      ListHeaderComponent={ListHeader}
      stickyHeaderIndices={[0]}
      initialNumToRender={5}
      maxToRenderPerBatch={5}
      windowSize={3}
      removeClippedSubviews
      activationDistance={5}
      onDragBegin={(index) => onDragBegin(filterdLayers[index])}
      onDragEnd={({ from, to }) => updateLayersOrder(filterdLayers, from, to > from ? to + 1 : to)}
      getItemLayout={(_, index) => ({ length: 60, offset: 60 * index, index })}
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
  childAccent: {
    backgroundColor: COLOR.GROUP_ACCENT,
    borderRadius: 2,
    bottom: 8,
    left: 6,
    position: 'absolute',
    top: 8,
    width: 3,
    zIndex: 1,
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
  groupName: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingLeft: 10,
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
