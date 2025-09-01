import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { MockGpsConfig } from '../../utils/mockGpsHelper';
import { COLOR } from '../../constants/AppConstants';

interface MockGpsControllerProps {
  useMockGps: boolean;
  toggleMockGps: (enabled: boolean, config?: MockGpsConfig) => Promise<void>;
  mockGpsProgress?: { current: number; total: number; percentage: number };
}

export const MockGpsController: React.FC<MockGpsControllerProps> = ({ useMockGps, toggleMockGps, mockGpsProgress }) => {
  const [selectedScenario, setSelectedScenario] = useState<MockGpsConfig['scenario']>('longTrack');
  const [pointCount, setPointCount] = useState(200);  // デフォルトを200に変更
  const [speed, setSpeed] = useState(10);
  const [updateInterval, setUpdateInterval] = useState(500);
  const [speedPreset, setSpeedPreset] = useState<'normal' | 'fast' | 'superfast'>('normal');

  const scenarios: { value: MockGpsConfig['scenario']; label: string; description: string }[] = [
    { value: 'circle', label: '円形', description: '円形の軌跡を生成' },
    { value: 'line', label: '直線', description: '直線的な軌跡を生成' },
    { value: 'longTrack', label: '長い軌跡', description: '長い複雑な軌跡を生成' },
    { value: 'random', label: 'ランダム', description: 'ランダムな動きを生成' },
    { value: 'static', label: '静止', description: '同じ場所に留まる' },
  ];

  const speedPresets = [
    { value: 'normal' as const, label: '通常', speed: 10, interval: 500, description: '約42分' },
    { value: 'fast' as const, label: '高速', speed: 50, interval: 100, description: '約8分' },
    { value: 'superfast' as const, label: '超高速', speed: 100, interval: 20, description: '約2分' },
  ];

  const handleSpeedPresetChange = (preset: 'normal' | 'fast' | 'superfast') => {
    const selected = speedPresets.find((p) => p.value === preset);
    if (selected) {
      setSpeedPreset(preset);
      setSpeed(selected.speed);
      setUpdateInterval(selected.interval);
    }
  };

  const handleToggleMockGps = async () => {
    if (!useMockGps) {
      const config: MockGpsConfig = {
        enabled: true,
        scenario: selectedScenario,
        speed,
        updateInterval,
        center: {
          latitude: 35.6812,
          longitude: 139.7671,
        },
        radius: 500,
        pointCount: pointCount,  // すべてのシナリオでポイント数を設定
      };

      Alert.alert(
        '擬似GPSを有効化',
        `${scenarios.find((s) => s.value === selectedScenario)?.label}モードで擬似GPSを開始します。\n` +
          `ポイント数: ${pointCount}\n` +
          `速度: ${speed} m/s\n` +
          `更新間隔: ${updateInterval} ms`,
        [
          { text: 'キャンセル', style: 'cancel' },
          {
            text: '開始',
            onPress: () => toggleMockGps(true, config),
          },
        ]
      );
    } else {
      Alert.alert('擬似GPSを無効化', '擬似GPSを停止しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '停止',
          onPress: () => toggleMockGps(false),
          style: 'destructive',
        },
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🔧 擬似GPSテストツール (開発用)</Text>
        <TouchableOpacity
          style={[styles.toggleButton, useMockGps && styles.activeButton]}
          onPress={handleToggleMockGps}
        >
          <Text style={styles.buttonText}>{useMockGps ? '停止' : '開始'}</Text>
        </TouchableOpacity>
      </View>

      {!useMockGps && (
        <ScrollView style={styles.settings}>
          <Text style={styles.sectionTitle}>速度プリセット</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginBottom: 15 }}>
            {speedPresets.map((preset) => (
              <TouchableOpacity
                key={preset.value}
                style={[styles.presetButton, speedPreset === preset.value && styles.selectedPresetButton]}
                onPress={() => handleSpeedPresetChange(preset.value)}
              >
                <Text
                  style={[styles.presetButtonText, speedPreset === preset.value && styles.selectedPresetButtonText]}
                >
                  {preset.label}
                </Text>
                <Text style={styles.presetDescription}>{preset.description}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.sectionTitle}>シナリオ選択</Text>
          {scenarios.map((scenario) => (
            <TouchableOpacity
              key={scenario.value}
              style={[styles.scenarioItem, selectedScenario === scenario.value && styles.selectedScenario]}
              onPress={() => setSelectedScenario(scenario.value)}
            >
              <Text style={styles.scenarioLabel}>{scenario.label}</Text>
              <Text style={styles.scenarioDescription}>{scenario.description}</Text>
            </TouchableOpacity>
          ))}

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>ポイント数: {pointCount}</Text>
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setPointCount(Math.max(100, pointCount - 100))}
              >
                <Text>-100</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setPointCount(Math.min(50000, pointCount + 100))}
              >
                <Text>+100</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>速度: {speed} m/s</Text>
            <View style={styles.buttonGroup}>
              <TouchableOpacity style={styles.adjustButton} onPress={() => setSpeed(Math.max(1, speed - 5))}>
                <Text>-5</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.adjustButton} onPress={() => setSpeed(Math.min(50, speed + 5))}>
                <Text>+5</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputSection}>
            <Text style={styles.inputLabel}>更新間隔: {updateInterval} ms</Text>
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setUpdateInterval(Math.max(100, updateInterval - 100))}
              >
                <Text>-100</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setUpdateInterval(Math.min(5000, updateInterval + 100))}
              >
                <Text>+100</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {useMockGps && mockGpsProgress && (
        <View style={styles.progress}>
          <Text style={styles.progressText}>
            進行状況: {mockGpsProgress.current} / {mockGpsProgress.total}
          </Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${mockGpsProgress.percentage}%` }]} />
          </View>
          <Text style={styles.progressPercentage}>{mockGpsProgress.percentage.toFixed(1)}%</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLOR.GRAY0,
    borderRadius: 10,
    padding: 15,
    margin: 10,
    shadowColor: COLOR.BLACK,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLOR.GRAY4,
  },
  toggleButton: {
    backgroundColor: COLOR.DARKGREEN,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 5,
  },
  activeButton: {
    backgroundColor: COLOR.RED,
  },
  buttonText: {
    color: COLOR.WHITE,
    fontWeight: 'bold',
  },
  settings: {
    maxHeight: 300,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 10,
    color: COLOR.GRAY3,
  },
  scenarioItem: {
    backgroundColor: COLOR.WHITE,
    padding: 10,
    marginBottom: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLOR.GRAY1,
  },
  selectedScenario: {
    borderColor: COLOR.DARKGREEN,
    backgroundColor: COLOR.GRAY0,
  },
  scenarioLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLOR.GRAY4,
  },
  scenarioDescription: {
    fontSize: 12,
    color: COLOR.GRAY3,
    marginTop: 2,
  },
  inputSection: {
    marginTop: 15,
  },
  inputLabel: {
    fontSize: 14,
    color: COLOR.GRAY4,
    marginBottom: 5,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  adjustButton: {
    backgroundColor: COLOR.WHITE,
    paddingHorizontal: 15,
    paddingVertical: 5,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLOR.GRAY1,
  },
  progress: {
    marginTop: 15,
  },
  progressText: {
    fontSize: 12,
    color: COLOR.GRAY3,
    marginBottom: 5,
  },
  progressBar: {
    height: 20,
    backgroundColor: COLOR.GRAY1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLOR.DARKGREEN,
  },
  progressPercentage: {
    fontSize: 12,
    color: COLOR.GRAY3,
    marginTop: 5,
    textAlign: 'center',
  },
  presetButton: {
    backgroundColor: COLOR.WHITE,
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: COLOR.GRAY1,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
  },
  selectedPresetButton: {
    backgroundColor: COLOR.BLUE,
    borderColor: COLOR.BLUE,
  },
  presetButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLOR.GRAY4,
  },
  selectedPresetButtonText: {
    color: COLOR.WHITE,
  },
  presetDescription: {
    fontSize: 10,
    color: COLOR.GRAY3,
    marginTop: 2,
  },
});
