import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Notification } from '../lib/data/notifications.interface';
import { SuccessHandler, ErrorHandler } from '../lib/utils/handlers';
import { NotificationDto } from './dto/notifications.dto';
import { LoggerService } from '../logger/logger.service';
import { NotificationType } from '../lib/data/types';
import { ReportData } from '../lib/data/reports.interface';
import { ArStage, ArStatus } from '../lib/data/reports.types';
import { Payroll, PayrollStatus } from '../lib/data/payroll.interface';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { getUserById } from '../lib/utils/helpers';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly loggerService: LoggerService, // Temporart
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  private get db() {
    return this.databaseService.getClient();
  }

  async createCustomNotification(
    userId: string,
    type: NotificationType,
    title: string,
    description: string,
    reportId: string | null = null,
  ): Promise<Notification> {
    return this.createNotificationRecord(
      userId,
      type,
      title,
      description,
      reportId,
    );
  }

  /**
   * userId is a professor or a staff id. It goes into whichever column
   * matches; the CHECK constraint rejects ids found in neither table.
   */
  private async createNotificationRecord(
    userId: string,
    type: NotificationType,
    title: string,
    description: string,
    reportId: string | null,
  ): Promise<Notification> {
    const res = await this.db.query<Notification>(
      `INSERT INTO user_notifications
         (professor_id, staff_id, type, title, description, report_id)
       VALUES (
         (SELECT id FROM user_professors WHERE id = $1),
         (SELECT id FROM user_staffs WHERE id = $1),
         $2, $3, $4, $5
       )
       RETURNING *`,
      [userId, type, title, description, reportId],
    );

    const notification = res.rows[0];

    this.realtimeGateway.emitNewNotification(userId, notification);

    return notification;
  }

  private readonly AR_STAGE_ORDER: ArStage[] = [
    'department_secretary',
    'hr',
    'accounting',
  ];

  private getStageRecipientId(ar: ReportData, stage: ArStage): string | null {
    switch (stage) {
      case 'department_secretary':
        return ar.department_secretary_id;
      case 'hr':
        return ar.hr_id;
      case 'accounting':
        return ar.accounting_id;
    }
  }

  private getStageNotificationType(stage: ArStage): NotificationType {
    switch (stage) {
      case 'department_secretary':
        return 'ar_department_secretary';
      case 'hr':
        return 'ar_hr';
      case 'accounting':
        return 'ar_accounting';
    }
  }

  private getStageLabel(stage: ArStage): string {
    switch (stage) {
      case 'department_secretary':
        return 'Department Secretary';
      case 'hr':
        return 'HR';
      case 'accounting':
        return 'Accounting';
    }
  }

  private getArLabel(ar: ReportData): string {
    const date = ar.period_start ?? ar.created_at;
    return `Accomplishment Report — ${new Date(date).toLocaleDateString(
      'en-PH',
      {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      },
    )}`;
  }

  private async notifyStageChecker(ar: ReportData, stage: ArStage) {
    const recipientId = this.getStageRecipientId(ar, stage);
    if (!recipientId) return;

    await this.createNotificationRecord(
      recipientId,
      this.getStageNotificationType(stage),
      'AR Pending Your Review',
      `"${this.getArLabel(ar)}" is awaiting your review as ${this.getStageLabel(stage)}.`,
      ar.id,
    );
  }

  async notifyArSubmitted(ar: ReportData, submitterId: string) {
    await this.createNotificationRecord(
      submitterId,
      'ar_submitted',
      'Accomplishment Report Submitted',
      `Your accomplishment report "${this.getArLabel(ar)}" has been submitted for review.`,
      ar.id,
    );

    await this.notifyStageChecker(ar, this.AR_STAGE_ORDER[0]);
  }

  async notifyArForwarded(
    ar: ReportData,
    _actorId: string,
    fromStage: ArStage,
    toStage: ArStage,
  ) {
    if (!ar.user_id) return;

    await this.createNotificationRecord(
      ar.user_id,
      'ar_forwarded',
      'Accomplishment Report Forwarded',
      `Your report "${this.getArLabel(ar)}" was approved by ${this.getStageLabel(fromStage)} and forwarded to ${this.getStageLabel(toStage)}.`,
      ar.id,
    );

    await this.notifyStageChecker(ar, toStage);
  }

  async notifyArApproved(ar: ReportData) {
    if (!ar.user_id) return;

    await this.createNotificationRecord(
      ar.user_id,
      'ar_approved',
      'Accomplishment Report Approved',
      `Your accomplishment report "${this.getArLabel(ar)}" has been fully approved.`,
      ar.id,
    );
  }

  async notifyArRejected(ar: ReportData, _actorId: string, reason?: string) {
    if (!ar.user_id) return;

    await this.createNotificationRecord(
      ar.user_id,
      'ar_rejected',
      'Accomplishment Report Rejected',
      `Your accomplishment report "${this.getArLabel(ar)}" was rejected.${reason ? ` Reason: ${reason}` : ''}`,
      ar.id,
    );
  }

  async notifyArReturned(ar: ReportData, _actorId: string, reason?: string) {
    if (!ar.user_id) return;

    await this.createNotificationRecord(
      ar.user_id,
      'ar_returned',
      'Accomplishment Report Returned',
      `Your accomplishment report "${this.getArLabel(ar)}" was returned for revision.${reason ? ` Note: ${reason}` : ''}`,
      ar.id,
    );
  }

  async notifyArUpdated(
    ar: ReportData,
    actorId: string,
    currentStage: ArStage,
  ) {
    const recipientId = this.getStageRecipientId(ar, currentStage);
    if (!recipientId || recipientId === actorId) return;

    await this.createNotificationRecord(
      recipientId,
      'ar_updated',
      'Accomplishment Report Updated',
      `"${this.getArLabel(ar)}" was updated and resubmitted for your review.`,
      ar.id,
    );
  }

  async notifyArStatusChange(
    ar: ReportData,
    actorId: string,
    status: ArStatus,
    previousStatus: ArStatus,
  ) {
    switch (status) {
      case 'department_secretary_review':
        if (previousStatus === 'submitted' && ar.user_id) {
          await this.notifyArSubmitted(ar, ar.user_id);
        }
        return;

      case 'hr_review':
        await this.notifyArForwarded(ar, actorId, 'department_secretary', 'hr');
        return;

      case 'accounting_review':
        await this.notifyArForwarded(ar, actorId, 'hr', 'accounting');
        return;

      case 'approved':
        await this.notifyArApproved(ar);
        return;

      case 'rejected':
        await this.notifyArRejected(ar, actorId);
        return;

      case 'returned':
        await this.notifyArReturned(ar, actorId);
        return;

      default:
        if (!ar.user_id) return;
        await this.createNotificationRecord(
          ar.user_id,
          'ar_status_changed',
          'Accomplishment Report Status Updated',
          `Your accomplishment report "${this.getArLabel(ar)}" status changed to ${status}.`,
          ar.id,
        );
    }
  }

  // Payroll notifications have no link column in user_notifications.

  async notifyPayrollUpdated(payroll: Payroll) {
    await this.createNotificationRecord(
      payroll.employee_id,
      'payroll_updated',
      'Payroll Updated',
      `Your payroll for ${payroll.period} has been updated.`,
      null,
    );
  }

  async notifyPayrollReady(payroll: Payroll) {
    await this.createNotificationRecord(
      payroll.employee_id,
      'payroll_ready',
      'Payroll Ready to be Received',
      `Your payroll for ${payroll.period} has been processed and is ready to be received.`,
      null,
    );
  }

  async notifyPayrollRejected(
    payroll: Payroll,
    _actorId: string,
    reason?: string,
  ) {
    await this.createNotificationRecord(
      payroll.employee_id,
      'payroll_rejected',
      'Payroll Not Viable',
      `Your payroll for ${payroll.period} could not be processed.${reason ? ` Reason: ${reason}` : ''}`,
      null,
    );
  }

  async notifyPayrollMoved(
    payroll: Payroll,
    _actorId: string,
    fromStatus: PayrollStatus,
    toStatus: PayrollStatus,
  ) {
    await this.createNotificationRecord(
      payroll.employee_id,
      'payroll_moved',
      'Payroll Status Updated',
      `Your payroll for ${payroll.period} moved from ${fromStatus} to ${toStatus}.`,
      null,
    );
  }

  async notifyPayrollStatusChange(
    payroll: Payroll,
    actorId: string,
    status: PayrollStatus,
    previousStatus: PayrollStatus,
  ) {
    switch (status) {
      case 'ready':
        await this.notifyPayrollReady(payroll);
        return;

      case 'rejected':
        await this.notifyPayrollRejected(payroll, actorId);
        return;

      case 'processing':
        await this.notifyPayrollMoved(payroll, actorId, previousStatus, status);
        return;

      default:
        await this.createNotificationRecord(
          payroll.employee_id,
          'payroll_status_changed',
          'Payroll Status Updated',
          `Your payroll for ${payroll.period} status changed to ${status}.`,
          null,
        );
    }
  }

  async fetchNotificationByUser(
    userId: string,
    offset?: number,
    limit?: number,
  ) {
    try {
      const safeOffset = Math.max(Math.trunc(Number(offset)) || 0, 0);
      const safeLimit = Math.min(
        Math.max(Math.trunc(Number(limit)) || 20, 1),
        100,
      );

      const res = await this.db.query<Notification>(
        `SELECT * FROM user_notifications
         WHERE professor_id = $1 OR staff_id = $1
         ORDER BY created_at DESC
         OFFSET $2 LIMIT $3`,
        [userId, safeOffset, safeLimit],
      );
      // Fetch active announcements as notifications so announcements and notifications are unified
      const announcementsRes = await this.db.query<{
        id: string;
        title: string;
        body: string;
        category: string;
        is_pinned: boolean;
        published_at: Date | null;
        created_at: Date;
      }>(
        `SELECT id, title, body, category, is_pinned, published_at, created_at
           FROM announcements
          WHERE status = 'sent'
            AND (expires_at IS NULL OR expires_at > NOW())
          ORDER BY is_pinned DESC, COALESCE(published_at, created_at) DESC
          LIMIT $1`,
        [safeLimit],
      );

      const announcementNotifs = announcementsRes.rows.map((a) => ({
        id: a.id,
        professor_id: null,
        staff_id: null,
        title: a.title,
        description: a.body,
        body: a.body,
        type: 'performance_notification' as NotificationType,
        report_id: null,
        is_read: false,
        pinned: a.is_pinned,
        category: a.category,
        created_at: (a.published_at ?? a.created_at).toISOString(),
        updated_at: (a.published_at ?? a.created_at).toISOString(),
      }));

      const combined = [...announcementNotifs, ...res.rows];

      return SuccessHandler(
        'Successfully fetched user notifications',
        200,
        combined,
      );
    } catch (error) {
      if (error instanceof Error) return ErrorHandler(error.message, 500);
      return ErrorHandler('Internal Server Error', 500);
    }
  }

  async insertNotification(userId: string, payload: NotificationDto) {
    try {
      const user = await getUserById(this.db, userId);

      if (!user) return ErrorHandler('User Not Found!', 404);

      const notification = await this.createNotificationRecord(
        userId,
        payload.type,
        payload.title ?? '',
        payload.description,
        payload.report_id ?? null,
      );
      return SuccessHandler(
        'Successfully added notification',
        201,
        notification,
      );
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500);
      }

      return ErrorHandler('Internal Server Error', 500);
    }
  }

  async markReadNotificationByUser(userId: string, notificationId: string) {
    try {
      const res = await this.db.query<Notification>(
        `UPDATE user_notifications
         SET is_read = true, updated_at = NOW()
         WHERE id = $1 AND (professor_id = $2 OR staff_id = $2)
         RETURNING *`,
        [notificationId, userId],
      );

      if (res.rowCount === 0) {
        return ErrorHandler('Notification not found', 404);
      }

      this.realtimeGateway.emitNotificationRead(userId, notificationId);

      return SuccessHandler('Successfully marked as read', 200, res.rows[0]);
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500);
      }

      return ErrorHandler('Internal Server Error', 500);
    }
  }

  async markAllReadByUser(userId: string) {
    try {
      const res = await this.db.query<{ id: string }>(
        `UPDATE user_notifications
         SET is_read = true, updated_at = NOW()
         WHERE (professor_id = $1 OR staff_id = $1) AND is_read = false
         RETURNING id`,
        [userId],
      );

      for (const row of res.rows) {
        this.realtimeGateway.emitNotificationRead(userId, row.id);
      }

      return SuccessHandler('Successfully marked all as read', 200, {
        updated: res.rowCount ?? 0,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500);
      }

      return ErrorHandler('Internal Server Error', 500);
    }
  }

  async deleteNotificationByUser(userId: string, notificationId: string) {
    try {
      const res = await this.db.query<Notification>(
        `DELETE FROM user_notifications
         WHERE id = $2 AND (professor_id = $1 OR staff_id = $1)
         RETURNING *`,
        [userId, notificationId],
      );

      if (res.rowCount === 0) {
        return ErrorHandler(`Notification Deleted or Doesn't Exist`, 404);
      }

      this.realtimeGateway.emitNotificationDeleted(userId, notificationId);

      return SuccessHandler(
        'Successfully deleted notification',
        200,
        res.rows[0],
      );
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500);
      }

      return ErrorHandler('Internal Server Error', 500);
    }
  }
}
