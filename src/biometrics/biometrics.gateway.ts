import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  BiometricsService,
  BiometricsError,
  CredentialKind,
  UserType,
  PunchResult,
} from './biometrics.service';

// ─── Event payloads ────────────────────────────────────────────────────────

interface PunchPayload {
  kind: CredentialKind;
  value: string;
}

interface RegisterCheckPayload {
  userType: UserType;
  userId: string;
}

interface RegisterSavePayload {
  userType: UserType;
  userId: string;
  slot: number;
}

interface TodayPayload {
  userType: UserType;
  userId: string;
}

// ─── Typed socket.io generics ──────────────────────────────────────────────

interface ServerToClientEvents {
  'punch:result': (payload: PunchResult) => void;
  'register:slot': (payload: { slot: number }) => void;
  'register:saved': () => void;
  'register:status': (payload: {
    registered: number;
    nextFreeSlot: number | null;
  }) => void;
  'today:result': (payload: object | null) => void;
  error: (payload: { code: string; message: string }) => void;
}

interface ClientToServerEvents {
  punch: (payload: PunchPayload) => void;
  /** Check eligibility and return the next free slot in one step. */
  'register:check': (payload: RegisterCheckPayload) => void;
  /** Request the next free slot without an eligibility check. */
  'register:next-slot': () => void;
  /** Call after the device has confirmed the template is stored. */
  'register:save': (payload: RegisterSavePayload) => void;
  'register:status': () => void;
  /** Admin: clear all biometrics_id values so users can re-enrol. */
  'register:reset': () => void;
  today: (payload: TodayPayload) => void;
}

type InterServerEvents = Record<string, never>;
type SocketData = Record<string, never>;

type TypedServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type TypedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

// ─── Gateway ───────────────────────────────────────────────────────────────

@WebSocketGateway({
  namespace: '/biometrics',
  cors: {
    origin: [
      process.env.SERVER_URL,
      process.env.CORS_DEV,
      process.env.CORS_ORIGIN,
      process.env.CORS_UBUNTU,
      process.env.CORS_WEB,
    ],
    credentials: true,
  },
})
export class BiometricsGateway
  implements OnGatewayConnection<TypedSocket>, OnGatewayDisconnect<TypedSocket>
{
  @WebSocketServer()
  server!: TypedServer;

  private readonly logger = new Logger(BiometricsGateway.name);

  constructor(private readonly biometricsService: BiometricsService) {}

  // ─── Lifecycle ──────────────────────────────────────────────────────────

  handleConnection(client: TypedSocket) {
    const deviceKey = client.handshake.auth?.deviceKey as string | undefined;
    if (!deviceKey || deviceKey !== process.env.BIOMETRICS_DEVICE_KEY) {
      this.logger.warn(
        `Rejected connection from ${client.id}: invalid device key`,
      );
      client.disconnect();
      return;
    }
    this.logger.log(`Device connected: ${client.id}`);
  }

  handleDisconnect(client: TypedSocket) {
    this.logger.log(`Device disconnected: ${client.id}`);
  }

  // ─── Attendance ─────────────────────────────────────────────────────────

  @SubscribeMessage('punch')
  async handlePunch(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() payload: PunchPayload,
  ) {
    try {
      const result = await this.biometricsService.punchByCredential(
        payload.kind,
        payload.value,
      );
      client.emit('punch:result', result);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('today')
  async handleToday(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() payload: TodayPayload,
  ) {
    try {
      const record = await this.biometricsService.getTodayRecord(
        payload.userType,
        payload.userId,
      );
      client.emit('today:result', record);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  // ─── Registration ────────────────────────────────────────────────────────

  /** Checks eligibility then emits the next free slot — the natural enrolment entry point. */
  @SubscribeMessage('register:check')
  async handleRegisterCheck(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() payload: RegisterCheckPayload,
  ) {
    try {
      await this.biometricsService.assertCanRegister(
        payload.userType,
        payload.userId,
      );
      const slot = await this.biometricsService.nextFreeSlot();
      client.emit('register:slot', { slot });
    } catch (err) {
      this.emitError(client, err);
    }
  }

  /** Returns the next free slot without an eligibility check. */
  @SubscribeMessage('register:next-slot')
  async handleNextSlot(@ConnectedSocket() client: TypedSocket) {
    try {
      const slot = await this.biometricsService.nextFreeSlot();
      client.emit('register:slot', { slot });
    } catch (err) {
      this.emitError(client, err);
    }
  }

  /** Persists the registration after the device confirms the template is stored. */
  @SubscribeMessage('register:save')
  async handleRegisterSave(
    @ConnectedSocket() client: TypedSocket,
    @MessageBody() payload: RegisterSavePayload,
  ) {
    try {
      await this.biometricsService.saveRegistration(
        payload.userType,
        payload.userId,
        payload.slot,
      );
      client.emit('register:saved');
    } catch (err) {
      this.emitError(client, err);
    }
  }

  @SubscribeMessage('register:status')
  async handleRegisterStatus(@ConnectedSocket() client: TypedSocket) {
    try {
      const status = await this.biometricsService.getRegistrationStatus();
      client.emit('register:status', status);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  /** Admin: clears all biometrics_id values and emits the updated status. */
  @SubscribeMessage('register:reset')
  async handleRegisterReset(@ConnectedSocket() client: TypedSocket) {
    try {
      await this.biometricsService.resetRegistrations();
      const status = await this.biometricsService.getRegistrationStatus();
      client.emit('register:status', status);
    } catch (err) {
      this.emitError(client, err);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private emitError(client: TypedSocket, err: unknown) {
    if (err instanceof BiometricsError) {
      client.emit('error', { code: err.code, message: err.message });
    } else {
      this.logger.error(err);
      client.emit('error', {
        code: 'internal_error',
        message: 'An unexpected error occurred',
      });
    }
  }
}
