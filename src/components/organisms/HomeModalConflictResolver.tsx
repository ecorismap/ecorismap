import React from 'react';
import { View, StyleSheet, ScrollView, Modal, Text, Button } from 'react-native';

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
    candidates: any[];
    id: string;
    onSelect: (c: any) => void;
    onBulkSelect: (mode: 'self' | 'latest') => void;
  }) => {
    // unixtimeを日付文字列に変換する関数
    const formatDate = (unixtime: number | string) => {
      if (!unixtime) return '';
      const date = new Date(typeof unixtime === 'string' ? parseInt(unixtime, 10) : unixtime);
      if (date.getFullYear() < 2000) {
        return new Date(date.getTime() * 1000).toLocaleString('ja-JP', { hour12: false });
      }
      return date.toLocaleString('ja-JP', { hour12: false });
    };

    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={modalStyles.overlay}>
          <View style={modalStyles.modal}>
            <Text style={modalStyles.bold}>{`競合データID: ${id}`}</Text>

            <ScrollView style={modalStyles.scrollContainer}>
              {candidates.map((c, idx) => (
                <View key={idx} style={modalStyles.candidate}>
                  <Text>{`編集者: ${c.displayName} / 更新日時: ${formatDate(c.updatedAt)}`}</Text>
                  <Text selectable style={modalStyles.candidateField}>
                    {JSON.stringify(c.field, null, 2)}
                  </Text>
                  <Button title="このデータを採用" onPress={() => onSelect(c)} />
                </View>
              ))}
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
