import React from 'react';
import { Modal, StyleSheet, Switch, Text, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { useGnssAveraging } from '../../hooks/useGnssAveraging';
import { t } from '../../i18n/config';
import { estimateHorizontalAccuracy, fixQualityColor, fixQualityLabel, formatAccuracy } from '../../lib/gnss/toLocation';
import { Pressable } from '../atoms/Pressable';

const TARGET_COUNTS = [5, 10, 30, 60];

/** 外部GNSS受信機の複数エポックを平均して1点を記録する。requestGnssAveragingAsync で開く */
export const HomeModalGnssAveraging = React.memo(() => {
  const {
    visible,
    targetCount,
    setTargetCount,
    fixOnly,
    setFixOnly,
    latestFix,
    result,
    isComplete,
    restart,
    finish,
    cancel,
  } = useGnssAveraging();

  const count = result?.count ?? 0;
  const progress = Math.min(1, count / targetCount);

  return (
    <Modal animationType="none" transparent={true} visible={visible} onRequestClose={cancel}>
      <View style={styles.centeredView}>
        <View style={styles.frame}>
          <Text style={styles.title}>{`${t('GpsSettings.externalGnss.averaging.title')}`}</Text>

          <View style={styles.row}>
            {latestFix !== null ? (
              <>
                <View style={[styles.badge, { backgroundColor: fixQualityColor(latestFix.fixQuality) }]}>
                  <Text style={styles.badgeText}>{fixQualityLabel(latestFix.fixQuality)}</Text>
                </View>
                <Text style={styles.note}>{formatAccuracy(estimateHorizontalAccuracy(latestFix))}</Text>
              </>
            ) : (
              <Text style={styles.note}>{`${t('GpsSettings.externalGnss.waitingPosition')}`}</Text>
            )}
          </View>

          <Text style={styles.label}>{`${t('GpsSettings.externalGnss.averaging.epochs')}`}</Text>
          <View style={styles.row}>
            {TARGET_COUNTS.map((n) => (
              <Pressable
                key={n}
                style={[styles.segment, targetCount === n && styles.segmentSelected]}
                onPress={() => setTargetCount(n)}
              >
                <Text style={targetCount === n ? styles.segmentTextSelected : undefined}>{n}</Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.row, styles.switchRow]}>
            <Text style={styles.flex}>{`${t('GpsSettings.externalGnss.averaging.fixOnly')}`}</Text>
            <Switch value={fixOnly} onValueChange={setFixOnly} />
          </View>

          <View style={styles.progressTrack}>
            <View style={[styles.progressBar, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressText}>
            {`${t('GpsSettings.externalGnss.averaging.collected', { count, target: targetCount })}`}
          </Text>
          {result !== null && (
            <Text style={styles.note}>
              {`${t('GpsSettings.externalGnss.averaging.spread')} ${formatAccuracy(result.horizontalSpread)}` +
                (result.verticalSpread !== null ? ` / ${formatAccuracy(result.verticalSpread)}` : '') +
                `  ${t('GpsSettings.externalGnss.accuracy')} ${formatAccuracy(result.location.accuracy)}`}
            </Text>
          )}

          <View style={styles.buttons}>
            <Pressable
              style={[styles.button, isComplete && styles.primaryButton]}
              disabled={result === null}
              onPress={finish}
            >
              <Text style={isComplete ? styles.primaryButtonText : undefined}>
                {`${t('GpsSettings.externalGnss.averaging.record')}`}
              </Text>
            </Pressable>
            <Pressable style={styles.button} onPress={restart}>
              <Text>{`${t('GpsSettings.externalGnss.averaging.restart')}`}</Text>
            </Pressable>
            <Pressable style={styles.button} onPress={cancel}>
              <Text>{`${t('common.cancel')}`}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  badge: {
    borderRadius: 4,
    marginRight: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    color: COLOR.WHITE,
    fontSize: 12,
    fontWeight: '700',
  },
  button: {
    alignItems: 'center',
    backgroundColor: COLOR.GRAY1,
    borderRadius: 5,
    height: 44,
    justifyContent: 'center',
    minWidth: 80,
    paddingHorizontal: 8,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    marginTop: 16,
  },
  centeredView: {
    alignItems: 'center',
    backgroundColor: COLOR.ALFAGRAY,
    flex: 1,
    justifyContent: 'center',
  },
  flex: {
    flex: 1,
  },
  frame: {
    backgroundColor: COLOR.WHITE,
    borderRadius: 16,
    elevation: 5,
    paddingHorizontal: 20,
    paddingVertical: 18,
    width: '90%',
  },
  label: {
    color: COLOR.GRAY4,
    fontSize: 12,
    marginBottom: 4,
    marginTop: 12,
  },
  note: {
    color: COLOR.GRAY4,
    fontSize: 13,
  },
  primaryButton: {
    backgroundColor: COLOR.BLUE,
  },
  primaryButtonText: {
    color: COLOR.WHITE,
  },
  progressBar: {
    backgroundColor: COLOR.BLUE,
    height: 8,
  },
  progressText: {
    fontSize: 14,
    marginBottom: 4,
    marginTop: 6,
  },
  progressTrack: {
    backgroundColor: COLOR.GRAY1,
    borderRadius: 4,
    height: 8,
    marginTop: 14,
    overflow: 'hidden',
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  segment: {
    alignItems: 'center',
    borderColor: COLOR.GRAY2,
    borderRadius: 5,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  segmentSelected: {
    backgroundColor: COLOR.BLUE,
    borderColor: COLOR.BLUE,
  },
  segmentTextSelected: {
    color: COLOR.WHITE,
  },
  switchRow: {
    marginTop: 12,
  },
  title: {
    fontSize: 18,
    marginBottom: 10,
    textAlign: 'center',
  },
});
