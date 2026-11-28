import React, { useContext } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { COLOR } from '../../constants/AppConstants';
import { GpsSettingsContext } from '../../contexts/GpsSettings';
import { t } from '../../i18n/config';
import { Pressable } from '../atoms/Pressable';
import { formatDuration, formatRawBytes } from '../../lib/gnss/rawLogNames';

// 記録を始めてからこれだけ経ってもUBXが届かなければ、受信機の設定を疑うよう知らせる
const NO_UBX_WARNING_MS = 30_000;

/** 外部GNSS受信機のRAW記録（後処理用）の開始・停止と、記録したファイルの一覧 */
export const GpsSettingsRawLog = React.memo(() => {
  const {
    externalGnss: { snapshot, settings, rawLogs, setRawLogCorrections },
    pressStartRawLog,
    pressStopRawLog,
    pressShareRawLog,
    pressDeleteRawLog,
  } = useContext(GpsSettingsContext);
  const { status } = snapshot;
  const raw = status.rawLog;
  const isRecording = raw?.state === 'recording';
  const isConnected = status.link === 'connected';
  const logCorrections = settings.rawLogCorrections ?? true;
  const elapsed = isRecording && raw ? Date.now() - raw.startedAt : 0;

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Text style={styles.subTitle}>{`${t('GpsSettings.externalGnss.rawLog.title')}`}</Text>
          <Text style={styles.note}>
            {isRecording && raw
              ? `${t('GpsSettings.externalGnss.rawLog.recording')} ${formatDuration(elapsed)}  ${t(
                  'GpsSettings.externalGnss.rawLog.rover'
                )} ${formatRawBytes(raw.roverBytes)}${
                  logCorrections
                    ? `  ${t('GpsSettings.externalGnss.rawLog.correction')} ${formatRawBytes(raw.correctionBytes)}`
                    : ''
                }`
              : `${t('GpsSettings.externalGnss.rawLog.description')}`}
          </Text>
        </View>
        {isRecording ? (
          <Pressable
            testID="gpssettings-gnss-rawlog-stop"
            style={[styles.smallButton, styles.stopButton]}
            onPress={pressStopRawLog}
          >
            <Text style={[styles.smallButtonText, styles.primaryButtonText]}>{`${t(
              'GpsSettings.externalGnss.rawLog.stop'
            )}`}</Text>
          </Pressable>
        ) : (
          <Pressable
            testID="gpssettings-gnss-rawlog-start"
            style={[styles.smallButton, styles.primaryButton, !isConnected && styles.smallButtonDisabled]}
            disabled={!isConnected}
            onPress={pressStartRawLog}
          >
            <Text
              style={[styles.smallButtonText, styles.primaryButtonText, !isConnected && styles.smallButtonTextDisabled]}
            >{`${t('GpsSettings.externalGnss.rawLog.start')}`}</Text>
          </Pressable>
        )}
      </View>

      {isRecording && raw && elapsed > NO_UBX_WARNING_MS && raw.roverBytes === 0 && (
        <Text style={styles.error}>{`${t('GpsSettings.externalGnss.rawLog.noData')}`}</Text>
      )}
      {isRecording && raw && elapsed > NO_UBX_WARNING_MS && raw.roverBytes > 0 && !raw.sawUbx && (
        <Text style={styles.warning}>{`${t('GpsSettings.externalGnss.rawLog.noUbx')}`}</Text>
      )}
      {!isRecording && !isConnected && (
        <Text style={styles.note}>{`${t('GpsSettings.externalGnss.rawLog.needConnection')}`}</Text>
      )}
      {raw?.state === 'error' && (
        <Text
          style={styles.error}
        >{`${t('GpsSettings.externalGnss.rawLog.failed', { message: raw.error ?? '' })}`}</Text>
      )}

      <View style={[styles.row, styles.optionRow]}>
        <Text style={[styles.flex, styles.optionText]}>{`${t('GpsSettings.externalGnss.rawLog.logCorrections')}`}</Text>
        <Switch
          testID="gpssettings-gnss-rawlog-corrections"
          value={logCorrections}
          disabled={isRecording}
          onValueChange={setRawLogCorrections}
        />
      </View>
      {logCorrections && <Text style={styles.note}>{`${t('GpsSettings.externalGnss.rawLog.correctionTerms')}`}</Text>}

      {rawLogs.length > 0 && (
        <>
          <Text style={[styles.subTitle, styles.filesHeader]}>{`${t('GpsSettings.externalGnss.rawLog.files')}`}</Text>
          {rawLogs.map((entry, index) => {
            const isCurrent = isRecording && raw?.baseName === entry.baseName;
            const duration =
              entry.meta !== null && entry.meta.endedAt !== null
                ? `  ${formatDuration(entry.meta.endedAt - entry.meta.startedAt)}`
                : '';
            return (
              <View key={entry.baseName} style={[styles.row, styles.fileRow]}>
                <View style={styles.flex}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {entry.baseName}
                  </Text>
                  <Text style={styles.note}>{`${formatRawBytes(entry.totalBytes)}${duration}`}</Text>
                </View>
                <Pressable
                  testID={`gpssettings-gnss-rawlog-share-${index}`}
                  style={[styles.smallButton, isCurrent && styles.smallButtonDisabled]}
                  disabled={isCurrent}
                  onPress={() => pressShareRawLog(entry)}
                >
                  <Text style={[styles.smallButtonText, isCurrent && styles.smallButtonTextDisabled]}>{`${t(
                    'GpsSettings.externalGnss.rawLog.share'
                  )}`}</Text>
                </Pressable>
                <Pressable
                  testID={`gpssettings-gnss-rawlog-delete-${index}`}
                  style={[styles.smallButton, isCurrent && styles.smallButtonDisabled]}
                  disabled={isCurrent}
                  onPress={() => pressDeleteRawLog(entry)}
                >
                  <Text style={[styles.smallButtonText, isCurrent && styles.smallButtonTextDisabled]}>{`${t(
                    'GpsSettings.externalGnss.rawLog.delete'
                  )}`}</Text>
                </Pressable>
              </View>
            );
          })}
        </>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  // 外部GNSS受信機の欄のカードと揃える
  card: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.GRAY1,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },
  error: {
    color: COLOR.RED,
    fontSize: 12,
    marginTop: 6,
  },
  fileName: {
    fontSize: 13,
  },
  fileRow: {
    borderTopColor: COLOR.GRAY1,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
    paddingTop: 6,
  },
  filesHeader: {
    marginTop: 14,
  },
  flex: {
    flex: 1,
  },
  note: {
    color: COLOR.GRAY3,
    fontSize: 12,
    marginTop: 4,
  },
  optionRow: {
    marginTop: 10,
  },
  optionText: {
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: COLOR.BLUE,
  },
  primaryButtonText: {
    color: COLOR.WHITE,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  // グレーは無効の意味で使うので、押せるボタンは青枠にする
  smallButton: {
    backgroundColor: COLOR.WHITE,
    borderColor: COLOR.BLUE,
    borderRadius: 5,
    borderWidth: 1,
    marginHorizontal: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  smallButtonDisabled: {
    backgroundColor: COLOR.GRAY0,
    borderColor: COLOR.GRAY2,
  },
  smallButtonText: {
    color: COLOR.BLUE,
    fontSize: 13,
    fontWeight: '600',
  },
  smallButtonTextDisabled: {
    color: COLOR.GRAY3,
  },
  stopButton: {
    backgroundColor: COLOR.RED,
    borderColor: COLOR.RED,
  },
  subTitle: {
    color: COLOR.BLACK,
    fontSize: 15,
    fontWeight: '600',
  },
  warning: {
    color: COLOR.ORANGE,
    fontSize: 12,
    marginTop: 6,
  },
});
