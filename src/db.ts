import { Platform } from 'react-native';
import * as SQLite from 'expo-sqlite';

export async function initDatabase() {
  if (Platform.OS === 'web') return null;

  const db = await SQLite.openDatabaseAsync('ring_health.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS ring_metrics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bpm INTEGER,
      hrv_rmssd REAL,
      spo2 INTEGER,
      skin_temp REAL,
      resp_rate INTEGER,
      raw_packet TEXT NOT NULL,
      is_guest INTEGER NOT NULL DEFAULT 0,
      workout_id INTEGER,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS workout_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      start_time DATETIME NOT NULL,
      end_time DATETIME,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      avg_heart_rate REAL,
      max_heart_rate REAL,
      avg_spo2 REAL,
      avg_temp REAL,
      avg_hrv REAL
    );
  `);
  const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(ring_metrics)');
  if (!columns.some((column) => column.name === 'is_guest')) {
    await db.execAsync('ALTER TABLE ring_metrics ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0');
  }
  if (!columns.some((column) => column.name === 'workout_id')) {
    await db.execAsync('ALTER TABLE ring_metrics ADD COLUMN workout_id INTEGER');
  }
  return db;
}

export async function saveVitalReading(metrics: {
  bpm?: number;
  hrv_rmssd?: number;
  spo2?: number;
  skin_temp?: number;
  resp_rate?: number;
  raw_packet: string;
  is_guest?: boolean;
  workout_id?: number;
}) {
  const db = await initDatabase();
  if (!db) return;
  await db.runAsync(
    `INSERT INTO ring_metrics (bpm, hrv_rmssd, spo2, skin_temp, resp_rate, raw_packet, is_guest, workout_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      metrics.bpm ?? null,
      metrics.hrv_rmssd ?? null,
      metrics.spo2 ?? null,
      metrics.skin_temp ?? null,
      metrics.resp_rate ?? null,
      metrics.raw_packet,
      metrics.is_guest ? 1 : 0,
      metrics.workout_id ?? null,
    ]
  );
}

export async function clearMockData() {
  const db = await initDatabase();
  if (!db) return;

  const tableNames = ['ring_metrics', 'workout_sessions', 'vitals', 'workouts'];

  for (const tableName of tableNames) {
    try {
      await db.runAsync(`DELETE FROM ${tableName}`);
    } catch {
      // Legacy or optional tables may not exist; ignore them during startup cleanup.
    }
  }
}

export async function createWorkoutSession(startTime: string) {
  const db = await initDatabase();
  if (!db) return null;
  const result = await db.runAsync('INSERT INTO workout_sessions (start_time) VALUES (?)', [startTime]);
  return result.lastInsertRowId;
}

export async function finishWorkoutSession(session: {
  id: number;
  endTime: string;
  durationSeconds: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  avgSpo2: number | null;
  avgTemp: number | null;
  avgHrv: number | null;
}) {
  const db = await initDatabase();
  if (!db) return;
  await db.runAsync(
    `UPDATE workout_sessions SET end_time = ?, duration_seconds = ?, avg_heart_rate = ?, max_heart_rate = ?, avg_spo2 = ?, avg_temp = ?, avg_hrv = ? WHERE id = ?`,
    [session.endTime, session.durationSeconds, session.avgHeartRate, session.maxHeartRate, session.avgSpo2, session.avgTemp, session.avgHrv, session.id]
  );
}

export async function getVitalReadings(limit = 100) {
  const db = await initDatabase();
  if (!db) return [];
  return db.getAllAsync<{
    bpm: number | null;
    hrv_rmssd: number | null;
    spo2: number | null;
    skin_temp: number | null;
    resp_rate: number | null;
    raw_packet: string;
    is_guest: number;
    workout_id: number | null;
    timestamp: string;
  }>(
    `SELECT bpm, hrv_rmssd, spo2, skin_temp, resp_rate, raw_packet, is_guest, workout_id, timestamp
     FROM ring_metrics WHERE is_guest = 0 ORDER BY id DESC LIMIT ?`,
    [limit]
  );
}

export async function getLatestMetrics() {
  const db = await initDatabase();
  if (!db) return null;
  const result = await db.getFirstAsync<{
    bpm: number | null;
    hrv_rmssd: number | null;
    spo2: number | null;
    skin_temp: number | null;
    resp_rate: number | null;
    timestamp: string;
  }>(`SELECT bpm, hrv_rmssd, spo2, skin_temp, resp_rate, timestamp FROM ring_metrics WHERE is_guest = 0 ORDER BY id DESC LIMIT 1`);

  return result;
}
