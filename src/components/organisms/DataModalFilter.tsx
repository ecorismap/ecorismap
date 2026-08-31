import React, { useState, useEffect, useMemo } from 'react';
import { View, Modal, Text, StyleSheet, FlatList, ScrollView } from 'react-native';
import { Pressable } from '../atoms/Pressable';
import { COLOR } from '../../constants/AppConstants';
import { useWindow } from '../../hooks/useWindow';
import { t } from '../../i18n/config';
import { TextInput } from '../atoms';
import { FILTER_BLANK, FILTER_NOT_BLANK, narrowFilterCandidates } from '../../utils/Data';

interface Props {
  //対象列の選択肢。データ表の列と同じ並び。'_user_'はUser列
  fieldOptions: { value: string; label: string }[];
  //開いたときに選択しておく列
  initialFieldName: string;
  defaultValue: string;
  visible: boolean;
  //選択中の列のユニーク値を返す
  getFieldCandidates: (fieldName: string) => string[];
  //空欄でOKすると解除になるため、専用の解除ボタンは持たない
  pressOK: (value: string, fieldName: string) => void;
  pressCancel: () => void;
}

export const DataModalFilter = React.memo((props: Props) => {
  const { fieldOptions, initialFieldName, defaultValue, visible, getFieldCandidates, pressOK, pressCancel } = props;
  const [value, setValue] = useState('');
  const [fieldName, setFieldName] = useState('');
  const { windowWidth, windowHeight } = useWindow();
  const modalWidthScale = 0.7;

  const candidates = useMemo(() => getFieldCandidates(fieldName), [fieldName, getFieldCandidates]);
  //入力中のテキストで候補も絞る（かな吸収の正規化はレコードの絞り込みと同じ）
  const narrowedCandidates = useMemo(() => narrowFilterCandidates(candidates, value), [candidates, value]);

  useEffect(() => {
    if (visible) {
      setValue(defaultValue);
      setFieldName(initialFieldName);
    }
  }, [defaultValue, initialFieldName, visible]);

  const styles = StyleSheet.create({
    candidateItem: {
      borderBottomColor: COLOR.GRAY0,
      borderBottomWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    candidateItemSelected: {
      backgroundColor: COLOR.PALEBLUE,
    },
    candidateItemSpecialText: {
      color: COLOR.GRAY4,
      fontStyle: 'italic',
    },
    candidateList: {
      backgroundColor: COLOR.WHITE,
      borderColor: COLOR.GRAY1,
      borderTopWidth: 0,
      borderWidth: 1,
      maxHeight: windowHeight * 0.3,
      width: windowWidth * modalWidthScale,
    },
    fieldChip: {
      borderColor: COLOR.GRAY2,
      borderRadius: 14,
      borderWidth: 1,
      marginRight: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    fieldChipSelected: {
      backgroundColor: COLOR.BLUE,
      borderColor: COLOR.BLUE,
    },
    fieldChipText: {
      color: COLOR.BLACK,
      fontSize: 13,
    },
    fieldChipTextSelected: {
      color: COLOR.WHITE,
    },
    fieldChips: {
      marginBottom: 10,
      maxWidth: windowWidth * modalWidthScale,
    },
    input: {
      backgroundColor: COLOR.WHITE,
      borderColor: COLOR.GRAY1,
      borderWidth: 1,
      fontSize: 16,
      height: 40,
      paddingHorizontal: 12,
      width: windowWidth * modalWidthScale,
    },
    modalButtonContainer: {
      flexDirection: 'row',
      justifyContent: 'space-evenly',
      marginTop: 10,
      width: windowWidth * modalWidthScale,
    },
    modalCenteredView: {
      alignItems: 'center',
      flex: 1,
      justifyContent: 'center',
    },
    modalContents: {
      alignItems: 'center',
      width: windowWidth * modalWidthScale,
    },
    modalFrameView: {
      alignItems: 'center',
      backgroundColor: COLOR.WHITE,
      borderRadius: 20,
      elevation: 5,
      margin: 0,
      paddingHorizontal: 35,
      paddingVertical: 25,
      shadowColor: COLOR.BLACK,
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
    },
    modalOKCancelButton: {
      alignItems: 'center',
      backgroundColor: COLOR.GRAY1,
      borderRadius: 5,
      elevation: 2,
      height: 48,
      justifyContent: 'center',
      padding: 10,
      width: 80,
    },
    modalTitle: {
      fontSize: 20,
      marginBottom: 10,
      textAlign: 'center',
    },
  });

  return (
    <Modal animationType="none" transparent={true} visible={visible}>
      <View style={styles.modalCenteredView}>
        <View style={styles.modalFrameView}>
          <View style={styles.modalContents}>
            <Text style={styles.modalTitle}>{t('Data.label.filter')}</Text>

            {/* 対象列の選択。Pickerはモーダルの重ね表示になるため使わない */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fieldChips}>
              {fieldOptions.map((option) => {
                const selected = option.value === fieldName;
                return (
                  <Pressable
                    key={option.value}
                    style={[styles.fieldChip, selected && styles.fieldChipSelected]}
                    onPress={() => setFieldName(option.value)}
                  >
                    <Text style={[styles.fieldChipText, selected && styles.fieldChipTextSelected]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: 'row' }}>
              <TextInput
                placeholder={t('Data.label.filter')}
                value={value}
                style={styles.input}
                onChangeText={setValue}
                autoFocus
              />
            </View>

            {/* 空白/空白以外は値の編集が不要なため、タップで即適用する */}
            <View style={styles.candidateList}>
              {[
                { token: FILTER_BLANK, label: t('Data.label.blank') },
                { token: FILTER_NOT_BLANK, label: t('Data.label.notBlank') },
              ].map(({ token, label }) => (
                <Pressable key={token} style={styles.candidateItem} onPress={() => pressOK(token, fieldName)}>
                  <Text style={styles.candidateItemSpecialText} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {narrowedCandidates.length > 0 && (
              <FlatList
                style={styles.candidateList}
                data={narrowedCandidates}
                keyExtractor={(item) => item}
                keyboardShouldPersistTaps="always"
                initialNumToRender={15}
                getItemLayout={(_, index) => ({ length: 41, offset: 41 * index, index })}
                renderItem={({ item }) => (
                  <Pressable
                    style={[styles.candidateItem, item === value && styles.candidateItemSelected]}
                    onPress={() => setValue(item)}
                  >
                    <Text numberOfLines={1}>{item}</Text>
                  </Pressable>
                )}
              />
            )}

            <View style={styles.modalButtonContainer}>
              <Pressable style={styles.modalOKCancelButton} onPress={() => pressOK(value, fieldName)}>
                <Text>OK</Text>
              </Pressable>
              <Pressable style={styles.modalOKCancelButton} onPress={pressCancel}>
                <Text>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
});
