import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { UserSession } from '../lib/data/interfaces';
import {
  CreateSupportTicketDto,
  CreateTicketMessageDto,
  UpdateSupportTicketDto,
} from './dto/support.dto';

type TicketRow = {
  id: string;
  ticket_code: string;
  opened_by: string;
  subject: string;
  description: string | null;
  priority: string;
  status: string;
  assigned_to: string | null;
  opened_at: Date;
  resolved_at: Date | null;
  requester: string;
};

@Injectable()
export class SupportService {
  constructor(private readonly databaseService: DatabaseService) {}

  async listTickets(user: UserSession) {
    const client = this.databaseService.getClient();
    const params: string[] = [];
    const visibility =
      user.role === 'admin'
        ? ''
        : 'WHERE t.opened_by = $1';
    if (user.role !== 'admin') params.push(user.id);

    const result = await client.query<TicketRow>(
      `
        SELECT t.*,
          COALESCE((
            SELECT CONCAT_WS(' ', u.firstname, u.lastname)
            FROM (
              SELECT id, firstname, lastname FROM user_admins
              UNION ALL
              SELECT id, firstname, lastname FROM user_staffs
              UNION ALL
              SELECT id, firstname, lastname FROM user_professors
            ) u
            WHERE u.id = t.opened_by
          ), 'Unknown user') AS requester
        FROM support_tickets t
        ${visibility}
        ORDER BY t.opened_at DESC
      `,
      params,
    );

    return Promise.all(result.rows.map((ticket) => this.toTicket(ticket)));
  }

  async createTicket(user: UserSession, dto: CreateSupportTicketDto) {
    const client = this.databaseService.getClient();
    const result = await client.query<TicketRow>(
      `
        INSERT INTO support_tickets
          (ticket_code, opened_by, subject, description, priority)
        VALUES (
          CONCAT('ARIS-', TO_CHAR(NOW(), 'YYYYMMDDHH24MISS'), '-',
            SUBSTRING(REPLACE(gen_random_uuid()::text, '-', ''), 1, 6)),
          $1, $2, $3, COALESCE($4::ticket_priority, 'normal')
        )
        RETURNING *,
          COALESCE((
            SELECT CONCAT_WS(' ', u.firstname, u.lastname)
            FROM (
              SELECT id, firstname, lastname FROM user_admins
              UNION ALL
              SELECT id, firstname, lastname FROM user_staffs
              UNION ALL
              SELECT id, firstname, lastname FROM user_professors
            ) u WHERE u.id = opened_by
          ), 'Unknown user') AS requester
      `,
      [user.id, dto.subject.trim(), dto.description.trim(), dto.priority ?? null],
    );
    return this.toTicket(result.rows[0]);
  }

  async updateTicket(
    user: UserSession,
    ticketId: string,
    dto: UpdateSupportTicketDto,
  ) {
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only administrators can update ticket status.');
    }

    const result = await this.databaseService.getClient().query<TicketRow>(
      `
        UPDATE support_tickets
        SET status = COALESCE($2::ticket_status, status),
            priority = COALESCE($3::ticket_priority, priority),
            assigned_to = COALESCE($4::uuid, assigned_to),
            resolved_at = CASE
              WHEN $2 IN ('resolved', 'closed') THEN COALESCE(resolved_at, NOW())
              ELSE NULL
            END
        WHERE id = $1
        RETURNING *,
          COALESCE((
            SELECT CONCAT_WS(' ', u.firstname, u.lastname)
            FROM (
              SELECT id, firstname, lastname FROM user_admins
              UNION ALL
              SELECT id, firstname, lastname FROM user_staffs
              UNION ALL
              SELECT id, firstname, lastname FROM user_professors
            ) u WHERE u.id = opened_by
          ), 'Unknown user') AS requester
      `,
      [ticketId, dto.status ?? null, dto.priority ?? null, dto.assignedTo ?? null],
    );
    if (!result.rows[0]) throw new NotFoundException('Ticket not found.');
    return this.toTicket(result.rows[0]);
  }

  async addMessage(
    user: UserSession,
    ticketId: string,
    dto: CreateTicketMessageDto,
  ) {
    const client = this.databaseService.getClient();
    const ticket = await client.query<{ opened_by: string; status: string }>(
      'SELECT opened_by, status FROM support_tickets WHERE id = $1',
      [ticketId],
    );
    const target = ticket.rows[0];
    if (!target) throw new NotFoundException('Ticket not found.');
    if (user.role !== 'admin' && target.opened_by !== user.id) {
      throw new ForbiddenException('You can only reply to your own tickets.');
    }
    if (target.status === 'closed') {
      throw new ForbiddenException('Reopen the ticket before replying.');
    }

    const message = await client.query(
      `
        INSERT INTO support_ticket_messages (ticket_id, author_id, author_role, body)
        VALUES ($1, $2, $3, $4)
        RETURNING id, author_role, body, created_at
      `,
      [ticketId, user.id, user.role === 'admin' ? 'admin' : 'requester', dto.body.trim()],
    );
    return {
      id: message.rows[0].id,
      author: message.rows[0].author_role,
      text: message.rows[0].body,
      time: message.rows[0].created_at,
    };
  }

  private async toTicket(ticket: TicketRow) {
    const messages = await this.databaseService.getClient().query(
      `
        SELECT id, author_role, body, created_at
        FROM support_ticket_messages
        WHERE ticket_id = $1
        ORDER BY created_at ASC
      `,
      [ticket.id],
    );
    return {
      id: ticket.id,
      code: ticket.ticket_code,
      title: ticket.subject,
      requester: ticket.requester,
      priority: this.titleCase(ticket.priority),
      status: this.titleCase(ticket.status === 'in_progress' ? 'In Progress' : ticket.status),
      createdAt: ticket.opened_at,
      description: ticket.description,
      messages: messages.rows.map((message) => ({
        id: message.id,
        author: message.author_role,
        text: message.body,
        time: message.created_at,
      })),
    };
  }

  private titleCase(value: string) {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
