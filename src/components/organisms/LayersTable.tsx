import React, { useCallback, useContext } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { Picker, PointView, LineView, PolygonView, RectButton2, TextInput } from '../atoms';
import { t } from '../../i18n/config';
import { LayersContext } from '../../contexts/Layers';
import { FlatList } from 'react-native-gesture-handler';
import { LayerType } from '../../types';

export const LayersTable = () => {
  const {
    layers,
    changeExpand,
    changeVisible,
    changeLabel,
    changeCustomLabel,
    changeActiveLayer,
    pressLayerOrder,
    gotoData,
    gotoLayerEdit,
    gotoColorStyle,
  } = useContext(LayersContext);

  const hasCustomLabel = layers.some((layer) => layer.label === t('common.custom'));

  const [customLabel, setCustomLabel] = React.useState(
    layers.reduce((obj, layer) => ({ ...obj, [layer.id]: layer.customLabel }), {}) as { [key: string]: string }
  );

  const handleCustomLabel = useCallback(
    (id: string, value: string) => {
      const newCustomLabel = { ...customLabel, [id]: value };
      setCustomLabel(newCustomLabel);
    },
    [customLabel]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: LayerType; index: number }) => {
      // console.log(item.id, item.name, item.groupId, item.expanded);
      if (item.type !== 'LAYERGROUP' && item.groupId && !item.expanded) return null;
      const backgroundColor = item.type === 'LAYERGROUP' ? COLOR.GRAY1 : COLOR.MAIN;
      //ラベルの候補は、空白を追加し、Photoを抜く
      const fieldNames = [
        ...item.field.reduce((a, b) => (b.format !== 'PHOTO' ? [...a, b.name] : a), ['']),
        t('common.custom'),
      ];

      return (
        <View
          style={{
            flex: 1,
            height: 60,
            flexDirection: 'row',
          }}
        >
          <View
            style={[
              styles.td,
              {
                flex: 1,
                width: 50,
                borderRightColor: item.type === 'LAYERGROUP' ? COLOR.GRAY1 : COLOR.MAIN,
                backgroundColor: item.type === 'LAYERGROUP' || item.groupId ? COLOR.GRAY1 : COLOR.MAIN,
              },
            ]}
          >
            {item.type === 'LAYERGROUP' && (
              <RectButton2
                name={item.expanded ? 'chevron-down' : 'chevron-right'}
                onPress={() => changeExpand(item)}
                style={{ flex: 1, width: 40, alignItems: 'center', justifyContent: 'center', backgroundColor }}
              />
            )}
            {item.type !== 'LAYERGROUP' && (
              <RectButton2
                name={item.active ? 'square-edit-outline' : 'checkbox-blank-outline'}
                onPress={() => changeActiveLayer(index)}
                color={!item.active ? COLOR.GRAY2 : COLOR.GRAY3}
                style={{
                  flex: 1,
                  width: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: item.groupId ? COLOR.GRAY1 : COLOR.MAIN,
                }}
              />
            )}
          </View>
          <View
            style={[
              styles.td,
              {
                flex: 2,
                width: 100,
                borderRightColor: item.type === 'LAYERGROUP' ? COLOR.GRAY1 : COLOR.MAIN,
                backgroundColor,
              },
            ]}
          >
            <RectButton2
              name={item.visible ? 'eye' : 'eye-off-outline'}
              onPress={() => changeVisible(!item.visible, index)}
              color={COLOR.GRAY4}
              style={{
                backgroundColor,
                padding: 0,
              }}
            />

            {item.type === 'POINT' && (
              <TouchableOpacity onPress={() => gotoColorStyle(item)}>
                <PointView
                  style={{ margin: 2, transform: [{ scale: 0.6 }] }}
                  color={item.colorStyle.color}
                  size={20}
                  borderColor={COLOR.WHITE}
                />
              </TouchableOpacity>
            )}
            {item.type === 'LINE' && (
              <TouchableOpacity onPress={() => gotoColorStyle(item)}>
                <LineView
                  style={{
                    marginLeft: 3,
                    marginRight: 3,
                    marginTop: 10,
                    marginBottom: 10,
                    transform: [{ scale: 0.6 }],
                  }}
                  color={item.colorStyle.color}
                />
              </TouchableOpacity>
            )}
            {item.type === 'POLYGON' && (
              <TouchableOpacity onPress={() => gotoColorStyle(item)}>
                <PolygonView style={{ margin: 3, transform: [{ scale: 0.6 }] }} color={item.colorStyle.color} />
              </TouchableOpacity>
            )}
            {(item.type === 'NONE' || item.type === 'LAYERGROUP') && (
              <LineView style={{ marginLeft: 10, transform: [{ scale: 0.0 }] }} color={COLOR.MAIN} />
            )}
          </View>
          <TouchableOpacity
            style={[styles.td, { flex: 5, width: 150, borderRightWidth: 1, backgroundColor }]}
            onPress={() => (item.type === 'LAYERGROUP' ? null : gotoData(item))}
          >
            <Text style={{ flex: 4, padding: 5, textAlign: 'center' }} adjustsFontSizeToFit={true} numberOfLines={2}>
              {item.name}
            </Text>
            {item.type === 'LAYERGROUP' ? (
              <View style={[styles.icon, { marginHorizontal: 2 }]} />
            ) : (
              <MaterialCommunityIcons
                color={COLOR.GRAY3}
                style={[styles.icon, { marginHorizontal: 2 }]}
                size={16}
                name={'chevron-right'}
                iconStyle={{ marginRight: 0 }}
              />
            )}
          </TouchableOpacity>

          <View style={[styles.td, { flex: 5, width: 160, backgroundColor }]}>
            {item.type !== 'LAYERGROUP' && (
              <Picker
                selectedValue={item.label}
                onValueChange={(itemValue) => changeLabel(item, itemValue as string)}
                itemLabelArray={fieldNames}
                itemValueArray={fieldNames}
                maxIndex={fieldNames.length - 1}
              />
            )}
          </View>

          {hasCustomLabel && (
            <View style={[styles.td, { flex: 5, width: 160, backgroundColor }]}>
              {item.label === t('common.custom') && (
                <TextInput
                  placeholder={'field1|field2'}
                  placeholderTextColor={COLOR.GRAY3}
                  value={customLabel[item.id]}
                  onChangeText={(value: string) => handleCustomLabel(item.id, value)}
                  onBlur={() => changeCustomLabel(item, customLabel[item.id])}
                  style={styles.input}
                  editable={true}
                />
              )}
            </View>
          )}
          <View
            style={[
              styles.td,
              {
                flex: 3,
                width: 60,
                borderRightColor: item.type === 'LAYERGROUP' ? COLOR.GRAY1 : COLOR.MAIN,
                backgroundColor,
              },
            ]}
          >
            <RectButton2 name="table-cog" style={{ backgroundColor }} onPress={() => gotoLayerEdit(item)} />
          </View>
          <View
            style={[
              styles.td,
              {
                flex: 1,
                width: 50,
                backgroundColor,
              },
            ]}
          >
            <RectButton2
              name="chevron-double-up"
              style={{ backgroundColor }}
              onPress={() => pressLayerOrder(index)}
              color={COLOR.GRAY2}
            />
          </View>
        </View>
      );
    },
    [
      changeActiveLayer,
      changeCustomLabel,
      changeExpand,
      changeLabel,
      changeVisible,
      customLabel,
      gotoColorStyle,
      gotoData,
      gotoLayerEdit,
      handleCustomLabel,
      hasCustomLabel,
      pressLayerOrder,
    ]
  );
  const keyExtractor = useCallback((item: LayerType) => item.id, []);
  //console.log(layers);
  return (
    <View style={{ flexDirection: 'column', flex: 1, marginBottom: 10 }}>
      {layers.length !== 0 ? (
        <FlatList
          stickyHeaderIndices={[0]}
          initialNumToRender={15}
          data={layers}
          keyExtractor={keyExtractor}
          ListHeaderComponent={<LayersTitle hasCustomLabel={hasCustomLabel} />}
          renderItem={renderItem}
          removeClippedSubviews={true}
          disableVirtualization={true}
        />
      ) : (
        <LayersTitle hasCustomLabel={hasCustomLabel} />
      )}
    </View>
  );
};

const LayersTitle = React.memo((props: { hasCustomLabel: boolean }) => {
  const { hasCustomLabel } = props;
  return (
    <View style={{ flexDirection: 'row', height: 45 }}>
      <View style={[styles.th, { flex: 1, width: 50 }]}>
        <Text>{`${t('common.edit')}`}</Text>
      </View>
      <View style={[styles.th, { flex: 2, width: 100 }]}>
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
      {Platform.OS === 'web' ? (
        <>
          <View style={[styles.th, { flex: 3, width: 80, borderRightColor: COLOR.GRAY1 }]}>
            <Text>{`${t('common.layerSetting')}`}</Text>
          </View>
          <View style={[styles.th, { flex: 1, width: 30 }]} />
        </>
      ) : (
        <View style={[styles.th, { flex: 4, width: 110, borderRightColor: COLOR.GRAY1 }]}>
          <Text>{`${t('common.layerSetting')}`}</Text>
        </View>
      )}
    </View>
  );
});
const styles = StyleSheet.create({
  icon: {
    backgroundColor: COLOR.MAIN,
    flex: 1,
    padding: 0,
  },
  input: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 5,
    flex: 1,
    fontSize: 16,
    marginVertical: 10,
    paddingHorizontal: 10,
  },
  td: {
    alignItems: 'center',
    backgroundColor: COLOR.MAIN,
    borderBottomColor: COLOR.GRAY1,
    borderBottomWidth: 1,
    borderRightColor: COLOR.GRAY1,
    borderRightWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 5,
    paddingVertical: 0,
  },
  th: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderBottomColor: COLOR.GRAY2,
    borderRightColor: COLOR.GRAY2,
    borderRightWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 5,
    paddingVertical: 0,
  },
});
