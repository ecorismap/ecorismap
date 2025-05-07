import React from 'react';
import { View, StyleSheet, ScrollView, Modal, Text, Button, Image } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RecordType } from '../../types';
import { COLOR } from '../../constants/AppConstants';
import dayjs from '../../i18n/dayjs';
import { t } from '../../i18n/config';

const MODAL_OVERLAY_COLOR = 'rgba(0,0,0,0.5)';
const MODAL_BG_COLOR = '#fff';
const MODAL_BORDER_COLOR = '#eee';

const modalStyles = StyleSheet.create({
  bold: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  buttonWrapper: {
    flex: 1,
    marginHorizontal: 4,
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
  photoList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  scrollContainer: {
    marginBottom: 16,
    maxHeight: 300,
    maxWidth: 400,
  },

  thumbnailImage: {
    height: 100,
    marginBottom: 8,
    width: '48%',
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
    candidates: RecordType[];
    id: string;
    onSelect: (c: RecordType) => void;
    onBulkSelect: (mode: 'self' | 'latest') => void;
  }) => {
    const { i18n } = useTranslation();

    const formatDate = (unixtime?: number) => {
      if (!unixtime) return '';
      return dayjs(unixtime).locale(i18n.language).format('L LT');
    };

    return (
      <Modal visible={visible} transparent animationType="slide">
        <View style={modalStyles.overlay}>
          <View style={modalStyles.modal}>
            <Text style={modalStyles.bold}>{t('conflict.title', { id })}</Text>

            <ScrollView style={modalStyles.scrollContainer}>
              {candidates.map((c, idx) => {
                const fieldForDisplay = { ...c.field };
                if (fieldForDisplay && 'photo' in fieldForDisplay) {
                  delete fieldForDisplay.photo;
                }

                return (
                  <View key={idx} style={modalStyles.candidate}>
                    <Text>
                      {t('conflict.meta', {
                        displayName: c.displayName,
                        date: formatDate(c.updatedAt),
                      })}
                    </Text>

                    {c.deleted ? (
                      <Text style={modalStyles.deletedText}>
                        {t('conflict.deletedMark', {
                          date: formatDate(c.updatedAt),
                        })}
                      </Text>
                    ) : (
                      <>
                        <Text selectable style={modalStyles.candidateField}>
                          {JSON.stringify(fieldForDisplay, null, 2)}
                        </Text>

                        {c.field?.photo && Array.isArray(c.field.photo) && (
                          <View style={modalStyles.photoList}>
                            {c.field.photo.map((photo, photoIdx) =>
                              photo.thumbnail ? (
                                <Image
                                  key={photoIdx}
                                  source={{ uri: photo.thumbnail }}
                                  style={modalStyles.thumbnailImage}
                                  resizeMode="cover"
                                />
                              ) : null
                            )}
                          </View>
                        )}
                      </>
                    )}

                    <Button
                      title={c.deleted ? t('conflict.applyDelete') : t('conflict.applyThis')}
                      onPress={() => onSelect(c)}
                    />
                  </View>
                );
              })}
            </ScrollView>

            <View style={modalStyles.buttonContainer}>
              <View style={modalStyles.buttonWrapper}>
                <Button title={t('conflict.bulkSelf')} onPress={() => onBulkSelect('self')} />
              </View>
              <View style={modalStyles.buttonWrapper}>
                <Button title={t('conflict.bulkLatest')} onPress={() => onBulkSelect('latest')} />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    );
  }
);
