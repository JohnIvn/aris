/* eslint-disable @typescript-eslint/no-base-to-string */

import { randomUUID, timingSafeEqual } from 'crypto';
import { IncomingMessage } from 'http';
import { Duplex } from 'stream';
import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { WebSocket, WebSocketServer } from 'ws';
import {
  BiometricsError,
  BiometricsService,
  CredentialKind,
  UserType,
} from './biometrics.service';

/**
 * Raw WebSocket endpoint: ws(s)://<host>/biometrics
 *
 *  ESP32 device : /biometrics?deviceId=aris-bio-001            Authorization: Bearer BIOMETRIC_DEVICE_TOKEN
 *  Admin client : /biometrics?role=client&token=<CLIENT_TOKEN>  (token == BIOMETRIC_CLIENT_TOKEN)
 *
 * NOT a Nest @WebSocketGateway: it attaches a plain `ws` server to Nest's HTTP server and only
 * handles upgrades for /biometrics, so it coexists with the Socket.IO RealtimeGateway
 * (keep the default IoAdapter; do NOT register WsAdapter). Messages use the aris-biometric
 * envelope, NOT { event, data }.
 *
 * Client commands: ping, device_status, register, verify, reset_registrations, punch, today
 */

const PROTOCOL = 'aris-biometric';
const PENDING_TTL_MS = 90_000;

type PendingKind = 'register' | 'verify' | 'reset' | 'ping' | 'rollback';

interface Pending {
  kind: PendingKind;
  client: WebSocket | null;
  clientReqId: string | null;
  clientCmd: string;
  meta?: any;
  sentAt: number;
  timer: NodeJS.Timeout;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

const WS_PATH = '/biometrics';

@Injectable()
export class BiometricsGateway
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly log = new Logger(BiometricsGateway.name);
  private readonly devices = new Map<string, WebSocket>();
  private readonly deviceInfo = new Map<string, any>();
  private readonly clients = new Set<WebSocket>();
  private readonly pending = new Map<string, Pending>();
  private readonly alive = new WeakMap<WebSocket, boolean>();
  private readonly heartbeat = setInterval(() => this.sweep(), 30_000);
  private wss!: WebSocketServer;

  constructor(
    private readonly service: BiometricsService,
    private readonly httpHost: HttpAdapterHost,
  ) {}

  onApplicationBootstrap() {
    const http = this.httpHost.httpAdapter.getHttpServer();
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
    this.wss.on('connection', (socket, req) =>
      this.handleConnection(socket, req),
    );
    http.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (pathname !== WS_PATH) return; // not ours: Socket.IO handles its own paths
      this.wss.handleUpgrade(req, socket, head, (ws) =>
        this.wss.emit('connection', ws, req),
      );
    });
    this.log.log(`Raw WebSocket listening on ${WS_PATH}`);
  }

  onModuleDestroy() {
    clearInterval(this.heartbeat);
    for (const p of this.pending.values()) clearTimeout(p.timer);
    this.wss?.close();
  }

  // ───────────────────────── Connection lifecycle ─────────────────────────

  private handleConnection(socket: WebSocket, req: IncomingMessage) {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const role =
      url.searchParams.get('role') === 'client' ? 'client' : 'device';

    if (!this.authorized(role, req, url)) {
      this.log.warn(`Rejected ${role} connection (bad token)`);
      socket.close(4401, 'unauthorized');
      return;
    }

    this.alive.set(socket, true);
    socket.on('pong', () => this.alive.set(socket, true));
    socket.on('error', (e) => this.log.warn(`socket error: ${e.message}`));
    socket.on('close', () => this.handleDisconnect(socket));

    if (role === 'client') {
      this.clients.add(socket);
      socket.on(
        'message',
        (raw) => void this.onClientMessage(socket, raw.toString()),
      );
      this.log.log('Client connected');
      return;
    }

    const deviceId = url.searchParams.get('deviceId') || 'unknown';
    const old = this.devices.get(deviceId);
    if (old && old !== socket) old.terminate();
    this.devices.set(deviceId, socket);
    socket.on(
      'message',
      (raw) => void this.onDeviceMessage(deviceId, raw.toString()),
    );
    this.log.log(
      `ESP32 connected: ${deviceId} (${req.socket.remoteAddress ?? 'unknown ip'})`,
    );
  }

  private handleDisconnect(socket: WebSocket) {
    this.clients.delete(socket);
    for (const [id, s] of this.devices) {
      if (s === socket) {
        this.devices.delete(id);
        this.deviceInfo.delete(id);
        this.log.log(`Device disconnected: ${id}`);
        this.broadcast('device_offline', { deviceId: id });
      }
    }
  }

  private authorized(
    role: 'device' | 'client',
    req: IncomingMessage,
    url: URL,
  ): boolean {
    const expected =
      role === 'device'
        ? process.env.BIOMETRIC_DEVICE_TOKEN
        : process.env.BIOMETRIC_CLIENT_TOKEN;
    if (!expected) {
      this.log.warn(
        `No token configured for ${role} connections - allowing (dev only)`,
      );
      return true;
    }
    const bearer = String(req.headers.authorization ?? '').replace(
      /^Bearer\s+/i,
      '',
    );
    const given =
      role === 'device' ? bearer : (url.searchParams.get('token') ?? bearer);
    return safeEqual(given, expected);
  }

  /** Server-side ping so dead connections (Railway proxy, WiFi loss) get dropped. */
  private sweep() {
    for (const s of [...this.clients, ...this.devices.values()]) {
      if (this.alive.get(s) === false) {
        s.terminate();
        continue;
      }
      this.alive.set(s, false);
      s.ping();
    }
  }

  // ───────────────────────── Send helpers ─────────────────────────

  private send(socket: WebSocket, msg: Record<string, unknown>) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({ protocol: PROTOCOL, protocolVersion: 1, ...msg }),
      );
    }
  }

  private reply(
    socket: WebSocket,
    reqId: string | null,
    command: string,
    data: unknown,
  ) {
    this.send(socket, {
      type: 'response',
      requestId: reqId,
      command,
      success: true,
      data,
      error: null,
    });
  }

  private fail(
    socket: WebSocket,
    reqId: string | null,
    command: string | null,
    err: unknown,
  ) {
    let e: { code: string; message: string };
    if (err instanceof BiometricsError) {
      e = { code: err.code, message: err.message };
    } else {
      this.log.error(err instanceof Error ? err.stack : String(err));
      e = { code: 'internal_error', message: 'Internal error' };
    }
    this.send(socket, {
      type: 'response',
      requestId: reqId,
      command,
      success: false,
      data: null,
      error: e,
    });
  }

  private broadcast(event: string, data: unknown) {
    for (const c of this.clients) {
      this.send(c, {
        type: 'event',
        requestId: null,
        command: null,
        event,
        data,
      });
    }
  }

  private pickDevice(id?: string): string {
    if (id) {
      if (!this.devices.has(id))
        throw new BiometricsError(
          'device_offline',
          `Device ${id} is not connected`,
        );
      return id;
    }
    const first = this.devices.keys().next().value as string | undefined;
    if (!first)
      throw new BiometricsError('device_offline', 'No device is connected');
    return first;
  }

  /** Sends a command to the device and remembers who is waiting for the answer. */
  private toDevice(
    deviceId: string,
    command: string,
    fields: Record<string, unknown>,
    p: Omit<Pending, 'timer' | 'sentAt'>,
  ) {
    const sock = this.devices.get(deviceId);
    if (!sock || sock.readyState !== WebSocket.OPEN) {
      throw new BiometricsError(
        'device_offline',
        `Device ${deviceId} is not connected`,
      );
    }
    const requestId = `srv-${randomUUID()}`;
    const timer = setTimeout(() => this.expire(requestId), PENDING_TTL_MS);
    this.pending.set(requestId, { ...p, sentAt: Date.now(), timer });
    this.send(sock, { requestId, command, ...fields });
  }

  private expire(requestId: string) {
    const p = this.pending.get(requestId);
    if (!p) return;
    this.pending.delete(requestId);
    if (p.client) {
      this.fail(
        p.client,
        p.clientReqId,
        p.clientCmd,
        new BiometricsError('device_timeout', 'Device did not answer'),
      );
    }
  }

  // ───────────────────────── Device -> server ─────────────────────────

  private async onDeviceMessage(deviceId: string, text: string) {
    let m: any;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (m?.protocol !== PROTOCOL) return;
    const p: Pending | undefined = m.requestId
      ? this.pending.get(m.requestId)
      : undefined;

    if (m.type === 'event') {
      switch (m.event) {
        case 'device_ready':
          this.deviceInfo.set(deviceId, m.data);
          this.log.log(
            `ESP32 ready: ${deviceId} fw=${m.data?.firmwareVersion ?? '?'} sensor=${m.data?.sensorStatus ?? '?'} templates=${m.data?.templateCount ?? '?'}`,
          );
          await this.warnIfOutOfSync(deviceId, m.data?.templateCount);
          this.broadcast('device_ready', { deviceId, ...m.data });
          try {
            this.toDevice(
              deviceId,
              'ping',
              {},
              {
                kind: 'ping',
                client: null,
                clientReqId: null,
                clientCmd: 'ping',
              },
            );
          } catch {
            /* offline again */
          }
          break;
        case 'auto_match':
          await this.onAutoMatch(deviceId, m.data);
          break;
        case 'auto_no_match':
          this.log.warn(`scan rejected by sensor: no_match (${deviceId})`);
          this.broadcast('scan_rejected', { deviceId, reason: 'no_match' });
          break;
        case 'sensor_status':
        case 'wifi_status':
          this.broadcast(m.event, { deviceId, ...m.data });
          break;
        case 'started':
        case 'enroll_progress':
        case 'capture_retry':
          if (p?.client) {
            this.send(p.client, {
              type: 'event',
              requestId: p.clientReqId,
              command: p.clientCmd,
              event: m.event,
              data: m.data,
            });
          }
          break;
        default:
          break;
      }
      return;
    }

    if (m.type === 'response' && p) {
      this.pending.delete(m.requestId);
      clearTimeout(p.timer);
      await this.onDeviceResponse(deviceId, p, m);
    }
  }

  /** The sensor and the DB must hold the same fingerprints; log loudly when the counts differ. */
  private async warnIfOutOfSync(deviceId: string, sensorCount: unknown) {
    if (typeof sensorCount !== 'number') return;
    try {
      const { registered } = await this.service.getRegistrationStatus();
      if (registered !== sensorCount) {
        this.log.warn(
          `${deviceId}: sensor holds ${sensorCount} fingerprint(s) but the DB has ${registered} registered. Run reset_registrations to resync.`,
        );
      }
    } catch (e) {
      this.log.error(e instanceof Error ? e.stack : String(e));
    }
  }

  private async onAutoMatch(deviceId: string, d: any) {
    try {
      const r = await this.service.punchByCredential(
        'biometric',
        String(d?.slot),
      );
      this.log.log(`punch ${r.action} #${r.session} slot=${d?.slot}`);
      this.broadcast('punch', { deviceId, score: d?.score, ...r });
    } catch (e) {
      const reason = e instanceof BiometricsError ? e.code : 'internal_error';
      if (!(e instanceof BiometricsError))
        this.log.error(e instanceof Error ? e.stack : String(e));
      this.log.warn(`scan rejected slot=${d?.slot} reason=${reason}`);
      this.broadcast('scan_rejected', { deviceId, slot: d?.slot, reason });
    }
  }

  private async onDeviceResponse(deviceId: string, p: Pending, m: any) {
    const c = p.client;

    if (p.kind === 'ping') {
      const data = {
        pong: true,
        deviceId,
        rttMs: Date.now() - p.sentAt,
        ...m.data,
      };
      this.log.log(`pong from ${deviceId} (${data.rttMs} ms)`);
      if (c) {
        if (m.success) this.reply(c, p.clientReqId, 'ping', data);
        else
          this.fail(
            c,
            p.clientReqId,
            'ping',
            new BiometricsError('device_error', 'ping failed'),
          );
      }
      return;
    }
    if (p.kind === 'rollback') {
      this.log.warn(
        `rollback of slot ${p.meta?.slot}: ${m.success ? 'ok' : 'FAILED'}`,
      );
      return;
    }
    if (!c) return;

    if (m.success !== true) {
      this.send(c, {
        type: 'response',
        requestId: p.clientReqId,
        command: p.clientCmd,
        success: false,
        data: null,
        error: m.error,
      });
      return;
    }

    try {
      switch (p.kind) {
        case 'register': {
          const { userType, userId, slot } = p.meta;
          try {
            await this.service.saveRegistration(userType, userId, slot);
          } catch (e) {
            // template is on the sensor but not in the DB: remove it so they stay in sync
            try {
              this.toDevice(
                deviceId,
                'delete_template',
                { slot, authToken: process.env.BIOMETRIC_ENROLL_TOKEN ?? '' },
                {
                  kind: 'rollback',
                  client: null,
                  clientReqId: null,
                  clientCmd: 'delete_template',
                  meta: { slot },
                },
              );
            } catch {
              /* device gone */
            }
            throw e;
          }
          this.reply(c, p.clientReqId, 'register', {
            registered: true,
            slot,
            templateCount: m.data?.templateCount,
          });
          break;
        }
        case 'verify': {
          const r = await this.service.punchByCredential(
            'biometric',
            String(m.data?.slot),
          );
          this.broadcast('punch', { deviceId, score: m.data?.score, ...r });
          this.reply(c, p.clientReqId, 'verify', {
            matched: true,
            slot: m.data?.slot,
            score: m.data?.score,
            ...r,
          });
          break;
        }
        case 'reset': {
          const cleared = await this.service.resetRegistrations();
          this.reply(c, p.clientReqId, 'reset_registrations', {
            reset: true,
            cleared,
          });
          break;
        }
      }
    } catch (e) {
      this.fail(c, p.clientReqId, p.clientCmd, e);
    }
  }

  // ───────────────────────── Client -> server ─────────────────────────

  private async onClientMessage(socket: WebSocket, text: string) {
    let m: any;
    try {
      m = JSON.parse(text);
    } catch {
      return this.fail(
        socket,
        null,
        null,
        new BiometricsError('malformed_json', 'Request is not valid JSON'),
      );
    }
    const reqId: string | null =
      typeof m?.requestId === 'string' ? m.requestId : null;
    const cmd: string = typeof m?.command === 'string' ? m.command : '';
    const enrollToken = process.env.BIOMETRIC_ENROLL_TOKEN ?? '';

    try {
      switch (cmd) {
        case 'ping':
          if (m.target === 'device') {
            this.toDevice(
              this.pickDevice(m.deviceId),
              'ping',
              {},
              {
                kind: 'ping',
                client: socket,
                clientReqId: reqId,
                clientCmd: 'ping',
              },
            );
          } else {
            this.reply(socket, reqId, 'ping', {
              pong: true,
              serverTime: new Date().toISOString(),
              devicesOnline: [...this.devices.keys()],
            });
          }
          break;

        case 'device_status':
          this.reply(socket, reqId, cmd, {
            devices: [...this.devices.keys()].map((id) => ({
              deviceId: id,
              ...this.deviceInfo.get(id),
            })),
            registration: await this.service.getRegistrationStatus(),
          });
          break;

        case 'register': {
          const userType = m.userType as UserType;
          const userId = m.userId as string;
          await this.service.assertCanRegister(userType, userId); // throws registration_closed
          const slot = await this.service.nextFreeSlot();
          this.toDevice(
            this.pickDevice(m.deviceId),
            'enroll',
            { slot, authToken: enrollToken, timeoutMs: 20_000 },
            {
              kind: 'register',
              client: socket,
              clientReqId: reqId,
              clientCmd: 'register',
              meta: { userType, userId, slot },
            },
          );
          break;
        }

        case 'verify':
          this.toDevice(
            this.pickDevice(m.deviceId),
            'match',
            { timeoutMs: 10_000 },
            {
              kind: 'verify',
              client: socket,
              clientReqId: reqId,
              clientCmd: 'verify',
            },
          );
          break;

        case 'reset_registrations':
          this.toDevice(
            this.pickDevice(m.deviceId),
            'clear_templates',
            { authToken: enrollToken },
            {
              kind: 'reset',
              client: socket,
              clientReqId: reqId,
              clientCmd: 'reset_registrations',
            },
          );
          break;

        case 'punch': {
          // for non-device sources, e.g. the authenticator app: { kind:'authenticator', value:'...' }
          const r = await this.service.punchByCredential(
            m.kind as CredentialKind,
            String(m.value ?? ''),
          );
          this.broadcast('punch', { source: m.kind, ...r });
          this.reply(socket, reqId, cmd, r);
          break;
        }

        case 'today':
          this.reply(
            socket,
            reqId,
            cmd,
            await this.service.getTodayRecords(m.userType, m.userId),
          );
          break;

        default:
          throw new BiometricsError('unknown_command', 'Unsupported command');
      }
    } catch (e) {
      this.fail(socket, reqId, cmd || null, e);
    }
  }
}
