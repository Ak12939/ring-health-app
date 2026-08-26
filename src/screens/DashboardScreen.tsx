import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View, Text, StyleSheet, ScrollView } from 'react-native';
import { bleService } from '../services/bleService';
import { clearMockData, saveVitalReading } from '../db';
import { VitalsChart } from '../components/ui/VitalsChart';

interface VitalMetrics {
  bpm: number | null;
  spo2: number | null;
  temp: number | null;
  hrv: number | null;
}

export const DashboardScreen: React.FC = () => {
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  const [bpmHistory, setBpmHistory] = useState<number[]>([]);
  const [vitals, setVitals] = useState<VitalMetrics>({
    bpm: null,
    spo2: null,
    temp: null,
    hrv: null,
  });
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const renderVitalLabel = (value: number | null, fallback: string) => value === null ? fallback : value;

  const measureNow = async () => {
    if (isMeasuring) return;

    setIsMeasuring(true);
    setShowSuccess(false);
    try {
      const reading = await bleService.measureVitals();
      setVitals({ bpm: reading.heartRate, spo2: reading.spo2, temp: reading.temp, hrv: reading.hrv });
      setBpmHistory((prev) => [...prev.slice(-19), reading.heartRate]);
      await saveVitalReading({
        bpm: reading.heartRate,
        hrv_rmssd: reading.hrv,
        spo2: reading.spo2,
        skin_temp: reading.temp,
        resp_rate: 0,
        raw_packet: reading.rawPacket,
      });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to measure vitals:', error);
    } finally {
      setIsMeasuring(false);
    }
  };

  useEffect(() => {
    clearMockData().catch((error) => console.error('Failed to clear mock data:', error));

    const statusSub = bleService.onStatusChange((status: string) => {
      setConnectionStatus(status);
    });

    const dataSub = bleService.onDataReceived(async (data: any) => {
      setVitals({
        bpm: typeof data.heartRate === 'number' ? data.heartRate : null,
        spo2: typeof data.spo2 === 'number' ? data.spo2 : null,
        temp: typeof data.temp === 'number' ? data.temp : null,
        hrv: typeof data.hrv === 'number' ? data.hrv : null,
      });

      if (typeof data.heartRate === 'number') {
        setBpmHistory((prev: number[]) => [...prev.slice(-19), data.heartRate]);
      }

      if (
        typeof data.heartRate === 'number' &&
        typeof data.spo2 === 'number' &&
        typeof data.temp === 'number' &&
        typeof data.hrv === 'number'
      ) {
        await saveVitalReading({
          bpm: data.heartRate,
          hrv_rmssd: data.hrv,
          spo2: data.spo2,
          skin_temp: data.temp,
          resp_rate: 15,
          raw_packet: data.rawPacket ?? 'NO_PACKET',
          is_guest: isGuestMode,
        });
      }
    });

    bleService.startScan();

    return () => {
      bleService.stopDeviceScan();
      statusSub();
      dataSub();
    };
  }, [isGuestMode]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerContainer}>
        <Text style={styles.headerTitle}>Ring Vitals</Text>
        <View style={styles.statusBadge}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connectionStatus === 'Connected (Mock)' || connectionStatus === 'Connected' ? '#30D158' : '#FF9F0A' },
            ]}
          />
          <Text style={styles.statusText}>{connectionStatus}</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: isMeasuring }}
        disabled={isMeasuring}
        onPress={measureNow}
        style={({ pressed }) => [styles.measureButton, pressed && !isMeasuring && styles.measureButtonPressed]}
      >
        {isMeasuring && <ActivityIndicator color="#FFFFFF" size="small" />}
        <Text style={styles.measureButtonText}>{isMeasuring ? 'Measuring Vitals...' : 'Measure Now'}</Text>
      </Pressable>

      {showSuccess && <Text style={styles.successBanner}>Vitals Updated Successfully</Text>}

      {/* Primary Vitals Grid */}
      <View style={styles.grid}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Heart Rate</Text>
          <Text style={styles.cardValue}>
            {vitals.bpm === null ? 'Waiting for Ring...' : renderVitalLabel(vitals.bpm, 'Waiting for Ring...')}
            {vitals.bpm !== null && <Text style={styles.unit}> BPM</Text>}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>SpO2</Text>
          <Text style={styles.cardValue}>
            {vitals.spo2 === null ? 'Waiting for Ring...' : renderVitalLabel(vitals.spo2, 'Waiting for Ring...')}
            {vitals.spo2 !== null && <Text style={styles.unit}> %</Text>}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>Skin Temp</Text>
          <Text style={styles.cardValue}>
            {vitals.temp === null ? 'Waiting for Ring...' : renderVitalLabel(vitals.temp, 'Waiting for Ring...')}
            {vitals.temp !== null && <Text style={styles.unit}> °C</Text>}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardLabel}>HRV (rMSSD)</Text>
          <Text style={styles.cardValue}>
            {vitals.hrv === null ? 'Waiting for Ring...' : renderVitalLabel(vitals.hrv, 'Waiting for Ring...')}
            {vitals.hrv !== null && <Text style={styles.unit}> ms</Text>}
          </Text>
        </View>
      </View>

      {/* SVG Sparkline Chart */}
      <VitalsChart
        data={bpmHistory}
        title="Heart Rate Trend"
        unit="BPM"
        color="#FF453A"
      />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    padding: 20,
    paddingTop: 60,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#EBEBF5',
    fontSize: 12,
    fontWeight: '500',
  },
  measureButton: {
    alignItems: 'center',
    backgroundColor: '#0A84FF',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    marginBottom: 12,
    paddingVertical: 15,
  },
  measureButtonPressed: {
    opacity: 0.78,
  },
  measureButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  successBanner: {
    backgroundColor: '#123D29',
    borderRadius: 10,
    color: '#30D158',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  card: {
    width: '48%',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardLabel: {
    color: '#8E8E93',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
  },
  cardValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  unit: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: 'normal',
  },
});