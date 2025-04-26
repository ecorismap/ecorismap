import React from 'react';
// Import Image from react-native
import { View, StyleSheet, ScrollView, Modal, Text, Button, Image } from 'react-native';
import { RecordType } from '../../types';
import { COLOR } from '../../constants/AppConstants';

// カラー定数を定義
const MODAL_OVERLAY_COLOR = 'rgba(0,0,0,0.5)';
const MODAL_BG_COLOR = '#fff';
const MODAL_BORDER_COLOR = '#eee';

// 競合解決用モーダル
const modalStyles = StyleSheet.create({
  bold: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  buttonContainer: {
    flexDirection: 'row', // 横並びになる
    justifyContent: 'space-between', // 両端にボタンを配置
  },
  buttonWrapper: {
    flex: 1,
    marginHorizontal: 4, // ボタン同士の間隔
  },
  candidate: {
    borderBottomWidth: 1,
    borderColor: MODAL_BORDER_COLOR,
    marginBottom: 12,
  },
  candidateField: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  deletedText: {
    color: COLOR.RED,
    marginVertical: 8,
  },
  modal: {
    backgroundColor: MODAL_BG_COLOR,
    borderRadius: 8,
    minWidth: 300,
    padding: 20,
  },
  overlay: {
    alignItems: 'center',
    backgroundColor: MODAL_OVERLAY_COLOR,
    flex: 1,
    justifyContent: 'center',
  },

  scrollContainer: {
    marginBottom: 16, // ScrollView とボタン群の間にスペース
    maxHeight: 300,
    maxWidth: 400,
  },
  // Add style for thumbnail image
  thumbnailImage: {
    height: 100, // Adjust size as needed
    marginVertical: 8,
    resizeMode: 'contain',
    width: 100, // Adjust size as needed
  },
});

export const ConflictResolverModal = React.memo(
  ({
    visible,
    candidates,
    id,
    onSelect,
    onBulkSelect,
  }: {
    visible: boolean;
    candidates: RecordType[]; // deleted フラグを持つ RecordType
    id: string;
    onSelect: (c: RecordType) => void;
    onBulkSelect: (mode: 'self' | 'latest') => void;
  }) => {
    const formatDate = (unixtime?: number) => {
      if (!unixtime) return '';
      return new Date(unixtime).toLocaleString('ja-JP', { hour12: false });
    };

    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={modalStyles.overlay}>
          <View style={modalStyles.modal}>
            <Text style={modalStyles.bold}>{`競合データID: ${id}`}</Text>

            <ScrollView style={modalStyles.scrollContainer}>
              {candidates.map((c, idx) => {
                // Create a copy of field and remove the photo property for display
                const fieldForDisplay = { ...c.field };
                if (fieldForDisplay && 'photo' in fieldForDisplay) {
                  delete fieldForDisplay.photo;
                }

                return (
                  <View key={idx} style={modalStyles.candidate}>
                    {/* 編集者／更新日時 */}
                    <Text>{`編集者: ${c.displayName} / 更新日時: ${formatDate(c.updatedAt)}`}</Text>

                    {/* 削除済みマーク */}
                    {c.deleted ? (
                      <Text style={modalStyles.deletedText}>[削除済み] {formatDate(c.updatedAt)}</Text>
                    ) : (
                      <>
                        {/* Display field data excluding photo */}
                        <Text selectable style={modalStyles.candidateField}>
                          {JSON.stringify(fieldForDisplay, null, 2)}
                        </Text>
                        {/* Display thumbnail image if available */}
                        {c.field?.photo &&
                          Array.isArray(c.field.photo) &&
                          c.field.photo.map(
                            (photo, photoIdx) =>
                              photo.thumbnail && (
                                <Image
                                  key={photoIdx}
                                  source={{ uri: photo.thumbnail }}
                                  style={modalStyles.thumbnailImage}
                                />
                              )
                          )}
                      </>
                    )}

                    {/* ボタンラベルも切り替え */}
                    <Button title={c.deleted ? '削除を適用' : 'このデータを採用'} onPress={() => onSelect(c)} />
                  </View>
                );
              })}
            </ScrollView>

            <View style={modalStyles.buttonContainer}>
              <View style={modalStyles.buttonWrapper}>
                <Button title="残りは自分優先" onPress={() => onBulkSelect('self')} />
              </View>
              <View style={modalStyles.buttonWrapper}>
                <Button title="残りは最新優先" onPress={() => onBulkSelect('latest')} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  }
);
