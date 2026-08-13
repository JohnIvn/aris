import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import {
  FingerprintDelete,
  FingerprintRegister,
} from '../lib/data/fingerprint.dto';
import { UserSession } from '../lib/data/interfaces';
import { isSessionCookie, parseCookieHeader } from '../lib/utils/helpers';

interface ServerToClientEvents {
  'fingerprint:register': (payload: FingerprintRegister) => Promise<void>;
  'fingerprint:delete': (payload: FingerprintDelete) => Promise<void>;
  'fingerprint:verify': () => Promise<void>;
}

type ClientToServerEvents = Record<string, never>;
// add inbound events here as you introduce them

type InterServerEvents = Record<string, never>;
// add cross-instance events here if you ever use socket.io's adapter broadcasting

interface SocketData {
  session: UserSession;
}

// Fully typed Server/Socket aliases — use these instead of the bare socket.io types.
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
@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: [
      process.env.CORS_DEV,
      process.env.CORS_ORIGIN,
      process.env.CORS_UBUNTU,
    ],
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection<TypedSocket>, OnGatewayDisconnect<TypedSocket>
{
  @WebSocketServer()
  server!: TypedServer;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: TypedSocket) {
    try {
      const session = this.extractSession(client);

      if (!session) {
        this.logger.warn(`Rejected socket ${client.id} — no valid session`);
        client.disconnect();
        return;
      }

      client.data.session = session;

      const room = this.userRoom(session.id);
      await client.join(room);

      this.logger.log(`User ${session.id} connected (${client.id}) → ${room}`);
    } catch (error) {
      this.logger.error(`Connection error: ${(error as Error).message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: TypedSocket) {
    const session = client.data.session;
    if (session) {
      this.logger.log(`User ${session.id} disconnected (${client.id})`);
    }
  }
  private extractSession(client: TypedSocket): UserSession | null {
    const rawCookie = client.handshake.headers.cookie;
    let token: string | undefined;

    if (rawCookie) {
      const parsed = parseCookieHeader(rawCookie) as { token: string };
      token = parsed.token;
    }

    if (!token) {
      const authToken = client.handshake.auth?.token as string;
      token = typeof authToken === 'string' ? authToken : undefined;
    }

    if (!token) return null;

    try {
      const decoded: unknown = this.jwtService.verify(token);
      return isSessionCookie(decoded) ? decoded : null;
    } catch {
      return null;
    }
  }

  private userRoom(userId: string): string {
    return `user:${userId}`;
  }

  private rooms(userIds: string[]): string[] {
    return [...new Set(userIds.map((id) => this.userRoom(id)))];
  }
}
