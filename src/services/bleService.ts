import { Platform } from 'react-native';
import { BleManager, Characteristic, Device } from 'react-native-ble-plx';

export const COLMI_UUIDS = {
  service: '6e40fff0-b5a3-f393-e0a9-e50e24dcca9e',
  tx: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  rx: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
} as const;

export const R09_UUIDS = {
  service: '0000FEE7-0000-1000-8000-00805F9B34FB',
  notify: '0000FEA1-0000-1000-8000-00805F9B34FB',
  command: '0000FEA2-0000-1000-8000-00805F9B34FB',
} as const;

export type ConnectionState = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

export interface ParsedPacket {
  battery?: number;
  heartRate?: number;
  spo2?: number;
  temp?: number;
  hrv?: number;
  bytes: Uint8Array;
}

export interface VitalReading {
  heartRate: number;
  spo2: number;
  temp: number;
  hrv: number;
  rawPacket: string;
}

export interface BLEDataPacket {
  heartRate?: number;
  spo2?: number;
  temperature?: number;
  temp?: number;
  hrv?: number;
  rawPacket?: string;
  timestamp: string;
}

export function parseColmiPacket(base64Payload: string): ParsedPacket {
  const binary = globalThis.atob(base64Payload);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  const packet: ParsedPacket = { bytes };
  if (bytes[0] === 0x03) packet.battery = bytes[1];
  if (bytes[0] === 0x06 || bytes[0] === 0x16) {
    packet.heartRate = bytes[1] || undefined;
    packet.spo2 = bytes[2] || undefined;
    packet.temp = bytes[3] ? bytes[3] / 10 : undefined;
  }
  return packet;
}

export const bleManager = Platform.OS !== 'web' ? new BleManager() : null;

export const scanAndConnectRing = (onDeviceConnected: (device: Device) => void) => {
  if (!bleManager) {
    console.warn('BLE scanning is not supported on web.');
    return;
  }

  bleManager.startDeviceScan([R09_UUIDS.service], null, (error, device) => {
    if (error) {
      console.error('Scan Error:', error);
      return;
    }

    if (!device) return;

    const validName = device.name?.startsWith('R09_') || device.localName?.startsWith('R09_');
    const validAdvertisement = (device.serviceData && Object.keys(device.serviceData).some((uuid) => uuid.toUpperCase() === R09_UUIDS.service.toUpperCase())) || (device.serviceUUIDs ?? []).some((uuid) => uuid.toUpperCase() === R09_UUIDS.service.toUpperCase());

    if (validName || validAdvertisement) {
      bleManager.stopDeviceScan();
      bleManager.connectToDevice(device.id)
        .then((connectedDevice) => connectedDevice.discoverAllServicesAndCharacteristics())
        .then((fullDevice) => {
          onDeviceConnected(fullDevice);
        })
        .catch((err) => console.error('Connection failed:', err));
    }
  });
};

export class BLEService {
  private dataListeners: ((data: any) => void)[] = [];
  private statusListeners: ((status: string) => void)[] = [];
  private connectionState: ConnectionState = 'DISCONNECTED';
  private bleManagerInstance: BleManager | null = bleManager;
  private connectedDevice: Device | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 3;
  private telemetryIntervalMs = 3000;
  private dataCharacteristic: Characteristic | null = null;

  private emitStatus(status: string) {
    this.statusListeners.forEach((listener) => listener(status));
  }

  private updateConnectionState(state: ConnectionState) {
    this.connectionState = state;
    const statusMap: Record<ConnectionState, string> = {
      DISCONNECTED: 'Disconnected',
      CONNECTING: 'Connecting',
      CONNECTED: 'Connected',
    };
    this.emitStatus(statusMap[state]);
  }

  private async handleDisconnection(deviceId: string) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.reconnectAttempts = 0;
      this.connectedDevice = null;
      this.dataCharacteristic = null;
      this.updateConnectionState('DISCONNECTED');
      return;
    }

    this.reconnectAttempts += 1;
    console.warn(`BLE disconnected. Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    this.updateConnectionState('CONNECTING');
    setTimeout(() => {
      this.connectToDevice(deviceId).catch((error) => {
        console.error('Auto-reconnect failed:', error);
        this.handleDisconnection(deviceId);
      });
    }, 1500 * this.reconnectAttempts);
  }

  private decodeR09Packet(base64Payload: string): BLEDataPacket | null {
    if (!base64Payload) return null;

    const binary = globalThis.atob(base64Payload);
    const buf = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const hexPacket = Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    console.debug('R09 packet', hexPacket);

    if (buf.length < 8) return null;

    const heartRate = buf[3] ?? buf[2] ?? 0;
    const spo2 = buf[4] ?? 0;
    const tempRaw = (buf[5] << 8) | buf[6];
    const temperature = tempRaw ? tempRaw / 100 : 0;
    const hrv = buf[7] ?? 0;

    if (heartRate === 0 || spo2 === 0) {
      return null;
    }

    return {
      heartRate,
      spo2,
      temperature,
      temp: temperature,
      hrv,
      rawPacket: Array.from(buf, (byte) => byte.toString(16).padStart(2, '0')).join(' '),
      timestamp: new Date().toISOString(),
    };
  }

  private handleIncomingPacket(base64Payload: string) {
    const parsed = this.decodeR09Packet(base64Payload);
    if (!parsed) return;

    const payload = {
      heartRate: parsed.heartRate,
      spo2: parsed.spo2,
      temp: parsed.temperature,
      temperature: parsed.temperature,
      hrv: parsed.hrv,
      rawPacket: parsed.rawPacket,
      timestamp: parsed.timestamp,
    };

    this.dataListeners.forEach((listener) => listener(payload));
  }

  private async subscribeToNotifications(device: Device) {
    try {
      device.monitorCharacteristicForService(R09_UUIDS.service, R09_UUIDS.notify, (error, characteristic) => {
        if (error) {
          console.error('Notification error:', error);
          return;
        }

        const value = characteristic?.value ?? null;
        if (!value) return;
        this.handleIncomingPacket(value);
      });

      this.dataCharacteristic = await device.readCharacteristicForService(R09_UUIDS.service, R09_UUIDS.notify).catch(() => null);
    } catch (error) {
      console.error('Failed to subscribe to notifications:', error);
    }
  }

  private async sendWakeCommand() {
    await this.sendRingCommand('AB0004FF3180');
  }

  startScan() {
    if (!this.bleManagerInstance || Platform.OS === 'web') {
      console.warn('BLE scanning is not supported on web.');
      return;
    }

    if (this.connectionState === 'CONNECTING' || this.connectionState === 'CONNECTED') {
      return;
    }

    this.bleManagerInstance.startDeviceScan([R09_UUIDS.service], null, (error, device) => {
      if (error) {
        console.error('BLE scan error:', error);
        return;
      }

      if (!device) return;

      const nameMatches = device.name?.startsWith('R09_') ?? false;
      const serviceMatches = (device.serviceUUIDs ?? []).some((uuid) => uuid.toUpperCase() === R09_UUIDS.service.toUpperCase()) || (device.serviceData ? Object.keys(device.serviceData).some((uuid) => uuid.toUpperCase() === R09_UUIDS.service.toUpperCase()) : false);

      if (nameMatches || serviceMatches) {
        this.bleManagerInstance?.stopDeviceScan();
        this.connectToDevice(device.id).catch((err) => {
          console.error('Ring connection failed:', err);
        });
      }
    });
  }

  stopDeviceScan() {
    if (this.bleManagerInstance) {
      this.bleManagerInstance.stopDeviceScan();
    }
  }

  async connectToDevice(deviceId: string) {
    if (!this.bleManagerInstance) {
      throw new Error('BLE is not available on this platform.');
    }

    this.updateConnectionState('CONNECTING');
    const device = await this.bleManagerInstance.connectToDevice(deviceId, { requestMTU: 185 });
    this.connectedDevice = await device.discoverAllServicesAndCharacteristics();
    this.reconnectAttempts = 0;
    this.updateConnectionState('CONNECTED');
    await this.subscribeToNotifications(this.connectedDevice);
    this.bleManagerInstance.onDeviceDisconnected(deviceId, () => {
      this.handleDisconnection(deviceId).catch((error) => console.error('Reconnect handling failed:', error));
    });
    await this.sendWakeCommand();
  }

  async disconnect() {
    if (this.connectedDevice) {
      await this.connectedDevice.cancelConnection();
    }
    this.connectedDevice = null;
    this.dataCharacteristic = null;
    this.updateConnectionState('DISCONNECTED');
  }

  async sendRingCommand(commandHex: string) {
    if (!this.connectedDevice) {
      throw new Error('Ring is not connected.');
    }

    const command = commandHex.replace(/\s+/g, '').replace(/^0x/i, '');
    if (!/^[0-9A-Fa-f]*$/.test(command) || command.length % 2 !== 0) {
      throw new Error(`Invalid ring command hex: ${commandHex}`);
    }

    const bytes = command.match(/.{1,2}/g)?.map((chunk) => Number.parseInt(chunk, 16)) ?? [];
    const binary = String.fromCharCode(...bytes);
    const base64 = globalThis.btoa(binary);

    const writeResult = await this.connectedDevice.writeCharacteristicWithResponseForService(
      R09_UUIDS.service,
      R09_UUIDS.command,
      base64
    );

    return writeResult;
  }

  measureVitals(durationMs = 15000): Promise<VitalReading> {
    return new Promise((resolve, reject) => {
      let latestReading: VitalReading | null = null;
      let unsubscribe: (() => void) | null = null;
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        unsubscribe?.();
        if (latestReading) {
          resolve(latestReading);
          return;
        }
        reject(error ?? new Error('No complete vital reading received during measurement.'));
      };

      unsubscribe = this.onDataReceived((data) => {
        if (
          typeof data.heartRate === 'number' &&
          typeof data.spo2 === 'number' &&
          typeof data.temp === 'number' &&
          typeof data.hrv === 'number'
        ) {
          latestReading = {
            heartRate: data.heartRate,
            spo2: data.spo2,
            temp: data.temp,
            hrv: data.hrv,
            rawPacket: data.rawPacket ?? 'NO_PACKET',
          };
        }
      });

      this.sendRingCommand('AB0004FF3180')
        .then(() => {
          setTimeout(() => finish(), durationMs);
        })
        .catch((error) => {
          finish(error as Error);
        });
    });
  }

  onDataReceived(callback: (data: any) => void) {
    this.dataListeners.push(callback);
    return () => {
      this.dataListeners = this.dataListeners.filter((listener) => listener !== callback);
    };
  }

  onStatusChange(callback: (status: string) => void) {
    this.statusListeners.push(callback);
    return () => {
      this.statusListeners = this.statusListeners.filter((listener) => listener !== callback);
    };
  }

  setTelemetryInterval(intervalMs: number) {
    this.telemetryIntervalMs = intervalMs;
  }

  findMyRing() {
    if (this.connectedDevice) {
      this.sendRingCommand('AB0004FF3180').catch((error) => console.error('Failed to send ring wake command:', error));
      return;
    }
    console.log('Find My Ring command: AB 00 04 FF 31 80');
  }
}

export const bleService = new BLEService();
  