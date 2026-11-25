import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Pressable } from './Pressable';

import { COLOR } from '../../constants/AppConstants';
import { ItemValue } from '@react-native-picker/picker/typings/Picker';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ModalSelector from 'react-native-modal-selector';
import { AncestorScrollSnapshot, guardAncestorScroll, snapshotAncestorScroll } from '../../utils/ancestorScrollGuard';

interface Props {
  style?: any;
  label?: string;
  selectedValue: string;
  onValueChange: (itemValue: ItemValue, itemIndex: number) => void;
  itemLabelArray: string[];
  itemValueArray: string[];
  maxIndex: number;
  enabled?: boolean;
  dropdownIcon?: boolean;
  /** E2Eから要素を特定するためのID */
  testID?: string;
  /** 選択肢のtestIDの接頭辞（`${optionTestIDPrefix}-${index}`）。未指定でtestIDがあれば`${testID}-option-${index}` */
  optionTestIDPrefix?: string;
}

const Picker = React.memo((props: Props) => {
  const {
    style,
    label,
    selectedValue,
    onValueChange,
    itemLabelArray,
    itemValueArray,
    maxIndex,
    enabled,
    dropdownIcon,
    testID,
    optionTestIDPrefix,
  } = props;

  return (
    <CustomPicker
      style={style}
      label={label}
      selectedValue={selectedValue}
      onValueChange={onValueChange}
      itemLabelArray={itemLabelArray}
      itemValueArray={itemValueArray}
      maxIndex={maxIndex}
      enabled={enabled}
      dropdownIcon={dropdownIcon}
      testID={testID}
      optionTestIDPrefix={optionTestIDPrefix}
    />
  );
});

const CustomPicker = React.memo((props: Props) => {
  const {
    style,
    label,
    selectedValue,
    onValueChange,
    itemLabelArray,
    itemValueArray,
    maxIndex,
    enabled,
    dropdownIcon,
    testID,
    optionTestIDPrefix,
  } = props;

  const items = itemValueArray.slice(0, maxIndex + 1).map((item, index) => ({
    label: itemLabelArray[index],
    value: itemValueArray[index],
    key: index,
    testID: optionTestIDPrefix ? `${optionTestIDPrefix}-${index}` : testID ? `${testID}-option-${index}` : undefined,
  }));
  const selectedLabel = itemLabelArray[itemValueArray.indexOf(selectedValue)];
  const selectorRef = useRef(null);
  // Web: モーダルを閉じたときのフォーカス復帰で祖先パネルがずれるのを戻す（ancestorScrollGuard.web.ts）
  const containerRef = useRef<View>(null);
  const scrollSnapshotRef = useRef<AncestorScrollSnapshot>(null);
  const cancelScrollGuardRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cancelScrollGuardRef.current?.(), []);

  const onModalOpen = () => {
    cancelScrollGuardRef.current?.();
    cancelScrollGuardRef.current = null;
    scrollSnapshotRef.current = snapshotAncestorScroll(containerRef.current);
  };

  const onModalClose = () => {
    cancelScrollGuardRef.current?.();
    cancelScrollGuardRef.current = guardAncestorScroll(scrollSnapshotRef.current);
  };

  const openSelector = () => {
    // enabledはこれまでaccessibleに渡すだけで実際には無効化されていなかった。
    // タイプ変更不可のレイヤ等でモーダルが開いてしまうため、falseなら開かない
    if (enabled === false) return;
    if (selectorRef.current) {
      // @ts-ignore
      selectorRef.current.open();
    }
  };

  return (
    <View ref={containerRef} style={styles.tr2}>
      {label && <Text style={styles.title}>{label}</Text>}
      <View style={styles.td2}>
        <Pressable testID={testID} onPress={openSelector} style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
          <View style={{ flex: 10 }}>
            <ModalSelector
              ref={selectorRef}
              disabled={enabled === false}
              data={items}
              initValueTextStyle={{
                color: COLOR.BLACK,
                minWidth: 100,
                textAlign: 'left',
                paddingLeft: 6,
                justifyContent: 'center',
              }}
              selectStyle={{ borderWidth: 0 }}
              //overlayStyle={{ backgroundColor: COLOR.DARKGREEN }}
              accessible={enabled}
              animationType={'none'}
              onModalOpen={onModalOpen}
              onModalClose={onModalClose}
              initValue={selectedLabel}
              onChange={(option) => {
                if (option.value !== selectedValue) onValueChange(option.value, option.key);
              }}
            />
          </View>
          {dropdownIcon === false ? null : (
            <View style={{ alignItems: 'flex-end', flex: 1, minWidth: 10 }}>
              <MaterialCommunityIcons
                color={COLOR.GRAY4}
                style={[styles.icon, { marginHorizontal: 3, backgroundColor: style?.backgroundColor ?? COLOR.MAIN }]}
                size={20}
                name={'chevron-down'}
                iconStyle={{ marginRight: 0 }}
                selectable={undefined}
              />
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  icon: {
    backgroundColor: COLOR.MAIN,
    //flex: 1,
    padding: 0,
  },
  td2: {
    alignItems: 'center',
    flex: 2,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
  },
  title: {
    color: COLOR.GRAY3,
    flex: 1,
    fontSize: 12,
  },
  tr2: {
    flex: 1,
    flexDirection: 'column',
    margin: 0,
  },
});

export default Picker;
