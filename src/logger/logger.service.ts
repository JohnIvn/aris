import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { LoggerAdminDto, LoggerAuthDto, LoggerUserDto } from './dto/logger.dto';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { AdminLog, UserLog } from '../lib/data/logger.interface';

export type SystemLogKind = 'auth' | 'security' | 'alert';

export interface SystemLogEntry {
  actor_user_id?: string | null;
  actor_label: string;
  kind: SystemLogKind;
  event: string;
  detail?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  session_id?: string | null;
}

@Injectable()
export class LoggerService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.getClient();
  }

  private errorResponse(error: unknown) {
    if (error instanceof Error) {
      return ErrorHandler(error.message, 500, error.name);
    }
    return ErrorHandler('Server Error', 500, 'Unknown Error');
  }

  /**
   * General system-wide access and security audit logs stored in `system_logs`.
   */
  async logSystemEvent(entry: SystemLogEntry) {
    try {
      await this.db.query(
        `
        INSERT INTO system_logs (
          actor_user_id,
          actor_label,
          kind,
          event,
          detail,
          ip_address,
          user_agent,
          session_id,
          occurred_at
        ) VALUES ($1, $2, $3::log_kind, $4, $5, $6, $7, $8, NOW())
        `,
        [
          entry.actor_user_id ?? null,
          entry.actor_label,
          entry.kind,
          entry.event,
          entry.detail ?? null,
          entry.ip_address ?? null,
          entry.user_agent ?? null,
          entry.session_id ?? null,
        ],
      );
    } catch (error) {
      console.error(
        '[SYSTEM LOGGING ERROR]',
        error instanceof Error ? error.message : error,
      );
    }
  }

  /**
   * Admin-only actions (user management). Recorded in `admin_logs`.
   */
  async logAdminAction(data: LoggerAdminDto) {
    try {
      const {
        action_type,
        auth_action,
        action_status,
        admin_id,
        user_id,
        metadata,
      } = data;
      const response = await this.db.query<AdminLog>(
        `
        INSERT INTO admin_logs (
            action_type,
            auth_action,
            action_status,
            admin_id,
            user_id, 
            metadata
        ) VALUES ( $1, $2, $3, $4, $5, $6)
         RETURNING *;
        `,
        [
          action_type ?? null,
          auth_action ?? null,
          action_status,
          admin_id,
          user_id ?? null,
          metadata ?? {},
        ],
      );

      if (!response)
        return ErrorHandler(
          'Error Recording Logs',
          500,
          'Database process failed, please try again later',
        );

      return SuccessHandler('Successfully recorded logs', 200, response);
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  /**
   * Staff/professor actions (reports, payroll). Recorded in `user_logs`.
   */
  async logUserAction(data: LoggerUserDto) {
    try {
      const {
        action_type,
        auth_action,
        action_status,
        user_id,
        role,
        metadata,
      } = data;

      // `user_logs` has no single FK target: staff and professors live in
      // separate tables. Populate the role-scoped FK column so the row is
      // actually linked to its subject.
      const staff_id = role === 'staff' ? user_id : null;
      const professor_id = role === 'professor' ? user_id : null;

      const response = await this.db.query<UserLog>(
        `
        INSERT INTO user_logs (
            action_type,
            auth_action,
            action_status,
            user_id,
            role,
            staff_id,
            professor_id,
            metadata
        ) VALUES ( $1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *;
        `,
        [
          action_type ?? null,
          auth_action ?? null,
          action_status,
          user_id,
          role,
          staff_id,
          professor_id,
          JSON.stringify(metadata ?? {}),
        ],
      );

      if (!response)
        return ErrorHandler(
          'Error Recording Logs',
          500,
          'Database process failed, please try again later',
        );

      return SuccessHandler('Successfully recorded logs', 200, response);
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  /**
   * Authentication actions (signin/signup/signout). Routed by role:
   * Recorded in `system_logs` for universal visibility, and also in
   * `admin_logs` / `user_logs` for legacy/granular audit tables.
   */
  async logAuthAction(data: LoggerAuthDto) {
    const { auth_action, action_status, user_id, role, metadata } = data;
    const meta = (metadata as Record<string, any>) || {};

    // 1. Record into system_logs
    const actorLabel =
      meta.name ||
      meta.email ||
      (role === 'admin'
        ? 'Administrator'
        : role
          ? `${role.charAt(0).toUpperCase() + role.slice(1)}`
          : 'Unknown');

    let kind: SystemLogKind = 'auth';
    let event = 'Signed in';
    let detail = `${meta.provider ? `${meta.provider} · ` : 'Web · '}${meta.email || actorLabel}`;

    if (auth_action === 'signout') {
      kind = 'auth';
      event = 'Signed out';
      detail = 'Session ended by user';
    } else if (action_status === 'failure') {
      kind = 'alert';
      event = 'Failed sign-in';
      detail = meta.reason
        ? `${meta.reason} · ${meta.email || 'Unknown'}`
        : `Failed sign-in attempt · ${meta.email || 'Unknown'}`;
    } else if (auth_action === 'signup') {
      kind = 'security';
      event = 'Account registered';
      detail = `New user account created · ${meta.email || actorLabel}`;
    }

    void this.logSystemEvent({
      actor_user_id: user_id ?? null,
      actor_label: actorLabel,
      kind,
      event,
      detail,
      ip_address: meta.ip || null,
      user_agent: meta.userAgent || null,
    });

    // 2. Legacy admin / user logs
    if (role === 'admin') {
      if (!user_id) {
        return SuccessHandler('Skipped anonymous auth log', 200, null);
      }

      return this.logAdminAction({
        auth_action,
        action_status,
        admin_id: user_id,
        metadata: metadata ?? {},
      });
    }

    if (!user_id) {
      return SuccessHandler('Skipped anonymous auth log', 200, null);
    }

    return this.logUserAction({
      auth_action,
      action_status,
      user_id,
      role: role ?? 'staff',
      metadata: metadata ?? {},
    });
  }
}
