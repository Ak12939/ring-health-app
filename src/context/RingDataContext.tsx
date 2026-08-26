import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createWorkoutSession, finishWorkoutSession, saveVitalReading } from '@/db';
import { bleService } from '@/services/bleService';

export interface RingVitals { heartRate: number | null; spo2: number | null; temp: number | null; hrv: number | null; }
export interface WorkoutSummary { durationSeconds: number; avgHeartRate: number | null; maxHeartRate: number | null; avgSpo2: number | null; avgTemp: number | null; avgHrv: number | null; }
interface RingDataContextValue { connected: boolean; battery: number; vitals: RingVitals; heartRateHistory: number[]; rawPacket: string; isGuestMode: boolean; setIsGuestMode: (value: boolean) => void; isMeasuring: boolean; measureNow: () => Promise<void>; findMyRing: () => void; startWorkout: () => Promise<void>; stopWorkout: () => Promise<void>; workoutActive: boolean; workoutElapsedSeconds: number; workoutSummary: WorkoutSummary | null; dismissWorkoutSummary: () => void; }
const RingDataContext = createContext<RingDataContextValue | null>(null);

export function RingDataProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [battery] = useState(84);
  const [vitals, setVitals] = useState<RingVitals>({ heartRate: null, spo2: null, temp: null, hrv: null });
  const [heartRateHistory, setHeartRateHistory] = useState<number[]>([64, 66, 65, 68, 67, 70, 68]);
  const [rawPacket, setRawPacket] = useState('Waiting for ring packets...');
  const [workoutActive, setWorkoutActive] = useState(false);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [workoutElapsedSeconds, setWorkoutElapsedSeconds] = useState(0);
  const [workoutSummary, setWorkoutSummary] = useState<WorkoutSummary | null>(null);
  const workoutIdRef = useRef<number | null>(null);
  const workoutStartRef = useRef<number | null>(null);
  const workoutSamplesRef = useRef<RingVitals[]>([]);

  useEffect(() => {
    const unsubscribeStatus = bleService.onStatusChange((status) => setConnected(status.includes('Connected')));
    const unsubscribeData = bleService.onDataReceived((data) => {
      setVitals({ heartRate: data.heartRate, spo2: data.spo2, temp: data.temp, hrv: data.hrv });
      setRawPacket(data.rawPacket ?? 'No raw packet');
      if (!isGuestMode && typeof data.heartRate === 'number') setHeartRateHistory((history) => [...history.slice(-19), data.heartRate]);
      if (workoutIdRef.current && typeof data.heartRate === 'number' && typeof data.spo2 === 'number' && typeof data.temp === 'number' && typeof data.hrv === 'number') {
        workoutSamplesRef.current.push({ heartRate: data.heartRate, spo2: data.spo2, temp: data.temp, hrv: data.hrv });
      }
      saveVitalReading({ bpm: data.heartRate, hrv_rmssd: data.hrv, spo2: data.spo2, skin_temp: data.temp, resp_rate: 15, raw_packet: data.rawPacket ?? 'NO_PACKET', is_guest: isGuestMode, workout_id: workoutIdRef.current ?? undefined }).catch(() => undefined);
    });
    bleService.startScan();
    return () => { bleService.stopDeviceScan(); unsubscribeStatus(); unsubscribeData(); };
  }, [isGuestMode]);

  useEffect(() => {
    if (!workoutActive) return;
    const timer = setInterval(() => {
      if (workoutStartRef.current) setWorkoutElapsedSeconds(Math.floor((Date.now() - workoutStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [workoutActive]);

  const startWorkout = useCallback(async () => {
    if (workoutActive) return;
    const startedAt = new Date();
    const sessionId = await createWorkoutSession(startedAt.toISOString());
    workoutIdRef.current = sessionId ?? Date.now();
    workoutStartRef.current = startedAt.getTime();
    workoutSamplesRef.current = [];
    setWorkoutElapsedSeconds(0);
    setWorkoutSummary(null);
    setWorkoutActive(true);
    bleService.setTelemetryInterval(1000);
  }, [workoutActive]);

  const stopWorkout = useCallback(async () => {
    if (!workoutActive || !workoutIdRef.current || !workoutStartRef.current) return;
    const sessionId = workoutIdRef.current;
    const endedAt = new Date();
    const samples = workoutSamplesRef.current;
    const average = (values: number[]) => values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
    const summary: WorkoutSummary = {
      durationSeconds: Math.max(0, Math.floor((endedAt.getTime() - workoutStartRef.current) / 1000)),
      avgHeartRate: average(samples.flatMap((sample) => sample.heartRate === null ? [] : [sample.heartRate])),
      maxHeartRate: samples.length ? Math.max(...samples.flatMap((sample) => sample.heartRate === null ? [] : [sample.heartRate])) : null,
      avgSpo2: average(samples.flatMap((sample) => sample.spo2 === null ? [] : [sample.spo2])),
      avgTemp: average(samples.flatMap((sample) => sample.temp === null ? [] : [sample.temp])),
      avgHrv: average(samples.flatMap((sample) => sample.hrv === null ? [] : [sample.hrv])),
    };
    workoutIdRef.current = null;
    workoutStartRef.current = null;
    workoutSamplesRef.current = [];
    setWorkoutElapsedSeconds(summary.durationSeconds);
    setWorkoutSummary(summary);
    setWorkoutActive(false);
    bleService.setTelemetryInterval(3000);
    await finishWorkoutSession({ id: sessionId, endTime: endedAt.toISOString(), durationSeconds: summary.durationSeconds, avgHeartRate: summary.avgHeartRate, maxHeartRate: summary.maxHeartRate, avgSpo2: summary.avgSpo2, avgTemp: summary.avgTemp, avgHrv: summary.avgHrv });
  }, [workoutActive]);

  const measureNow = useCallback(async () => {
    if (isMeasuring) return;
    setIsMeasuring(true);
    try {
      const reading = await bleService.measureVitals();
      setVitals({ heartRate: reading.heartRate, spo2: reading.spo2, temp: reading.temp, hrv: reading.hrv });
      await saveVitalReading({ bpm: reading.heartRate, hrv_rmssd: reading.hrv, spo2: reading.spo2, skin_temp: reading.temp, resp_rate: 15, raw_packet: reading.rawPacket, is_guest: isGuestMode });
    } finally {
      setIsMeasuring(false);
    }
  }, [isGuestMode, isMeasuring]);

  const value = useMemo(() => ({ connected, battery, vitals, heartRateHistory, rawPacket, isGuestMode, setIsGuestMode, isMeasuring, measureNow, findMyRing: () => bleService.findMyRing(), startWorkout, stopWorkout, workoutActive, workoutElapsedSeconds, workoutSummary, dismissWorkoutSummary: () => setWorkoutSummary(null) }), [battery, connected, heartRateHistory, isGuestMode, isMeasuring, measureNow, rawPacket, startWorkout, stopWorkout, vitals, workoutActive, workoutElapsedSeconds, workoutSummary]);
  return <RingDataContext.Provider value={value}>{children}</RingDataContext.Provider>;
}

export function useRingData() { const context = useContext(RingDataContext); if (!context) throw new Error('useRingData must be used inside RingDataProvider'); return context; }