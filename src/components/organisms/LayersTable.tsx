import React, { useContext } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, FlatList, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { COLOR } from '../../constants/AppConstants';
import { Picker, PointView, LineView, PolygonView, RectButton2, TextInput } from '../atoms';
import { t } from '../../i18n/config';
import { LayersContext } from '../../contexts/Layers';

export const LayersTable = () => {
  const { layers } = useContext(LayersContext);
  const hasCustomLabel = layers.some((layer) => layer.label === t('common.custom'));

  return (
    <View style={{ flexDirection: 'column', flex: 1, marginBottom: 10 }}>
      <LayersTitle hasCustomLabel={hasCustomLabel} />
      <LayersItems hasCustomLabel={hasCustomLabel} />
    </View>
  );
};

const LayersTitle = (props: { hasCustomLabel: boolean }) => {
  const { hasCustomLabel } = props;
  return (
    <View style={{ flexDirection: 'row', height: 45 }}>
      <View style={[styles.th, { flex: 2, width: 85 }]}>
        <Text>{`${t('common.visible')}`}</Text>
      </View>
      <View style={[styles.th, { flex: 2, width: 60 }]}>
        <Text>{`${t('common.edit')}`}</Text>
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
};

const LayersItems = (props: { hasCustomLabel: boolean }) => {
  const { hasCustomLabel } = props;
  const {
    layers,
    changeVisible,
    changeLabel,
    changeCustomLabel,
    changeActiveLayer,
    pressLayerOrder,
    gotoData,
    gotoLayerEdit,
    gotoColorStyle,
  } = useContext(LayersContext);

  const [customLabel, setCustomLabel] = React.useState(
    layers.reduce((obj, layer) => ({ ...obj, [layer.id]: layer.customLabel }), {}) as { [key: string]: string }
  );

  const handleCustomLabel = (id: string, value: string) => {
    const newCustomLabel = { ...customLabel, [id]: value };
    setCustomLabel(newCustomLabel);
  };

  //console.log(layers);
  return (
    <FlatList
      data={layers}
      initialNumToRender={layers.length}
      keyExtractor={(item) => item.id}
      renderItem={({ item, index }) => {
        //ラベルの候補は、空白を追加し、Photoを抜く
        const fieldNames = [
          ...item.field.reduce((a, b) => (b.format !== 'PHOTO' ? [...a, b.name] : a), ['']),
          t('common.custom'),
        ];

        return (
          <View style={{ flex: 1, height: 60, flexDirection: 'row' }}>
            <View style={[styles.td, { flex: 2, width: 85, borderRightColor: COLOR.MAIN }]}>
              <RectButton2 name={item.visible ? 'eye' : 'eye-off-outline'} onPress={() => changeVisible(item)} />
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
              {item.type === 'NONE' && (
                <LineView style={{ marginLeft: 10, transform: [{ scale: 0.6 }] }} color={COLOR.MAIN} />
              )}
            </View>
            <View style={[styles.td, { flex: 2, width: 60, borderRightColor: COLOR.MAIN }]}>
              <RectButton2
                name={item.active ? 'square-edit-outline' : 'checkbox-blank-outline'}
                onPress={() => changeActiveLayer(index)}
              />
            </View>
            <TouchableOpacity
              style={[styles.td, { flex: 5, width: 150, borderRightWidth: 1 }]}
              onPress={() => gotoData(item)}
            >
              <Text
                style={{ flex: 4, padding: 5, textAlign: 'center' }}
                adjustsFontSizeToFit={true}
                //numberOfLines={1}
              >
                {item.name}
              </Text>
              <MaterialCommunityIcons
                color={COLOR.GRAY4}
                style={[styles.icon, { marginHorizontal: 5 }]}
                size={25}
                name={'play-circle-outline'}
                iconStyle={{ marginRight: 0 }}
              />
            </TouchableOpacity>

            <View style={[styles.td, { flex: 5, width: 160 }]}>
              <Picker
                selectedValue={item.label}
                onValueChange={(itemValue) => changeLabel(item, itemValue as string)}
                itemLabelArray={fieldNames}
                itemValueArray={fieldNames}
                maxIndex={fieldNames.length - 1}
              />
            </View>

            {hasCustomLabel && (
              <View style={[styles.td, { flex: 5, width: 160 }]}>
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
            <View style={[styles.td, { flex: 3, width: 70, borderRightColor: COLOR.MAIN }]}>
              <RectButton2 name="table-cog" onPress={() => gotoLayerEdit(item)} />
            </View>
            <View style={[styles.td, { flex: 1, width: 40 }]}>
              <RectButton2 name="chevron-double-up" onPress={() => pressLayerOrder(index)} color={COLOR.GRAY2} />
            </View>
          </View>
        );
      }}
    />
  );
};

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
