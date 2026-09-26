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
    body: string,
    entityType: string,
    entityId: string | null,
    actorId: string | null,
  ): Promise<Notification> {
    return this.createNotificationRecord(
      userId,
      type,
      title,
      body,
      entityType,
      entityId,
      actorId,
    );
  }

  private async createNotificationRecord(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    entityType: string,
    entityId: string | null,
    actorId: string | null,
  ): Promise<Notification> {
    const res = await this.db.query<Notification>(
      `INSERT INTO notifications
       (user_id, type, title, body, entity_type, entity_id, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, type, title, body, entityType, entityId, actorId],
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
    const date = ar.shift_start ?? ar.created_at;
    return `Accomplishment Report — ${new Date(date).toLocaleDateString(
      'en-PH',
      {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      },
    )}`;
  }

  private async notifyStageChecker(
    ar: ReportData,
    stage: ArStage,
    actorId: string,
  ) {
    const recipientId = this.getStageRecipientId(ar, stage);
    if (!recipientId) return;

    await this.createNotificationRecord(
      recipientId,
      this.getStageNotificationType(stage),
      'AR Pending Your Review',
      `"${this.getArLabel(ar)}" is awaiting your review as ${this.getStageLabel(stage)}.`,
      'accomplishment_reports',
      ar.id,
      actorId,
    );
  }

  async notifyArSubmitted(ar: ReportData, submitterId: string) {
    await this.createNotificationRecord(
      submitterId,
      'ar_submitted',
      'Accomplishment Report Submitted',
      `Your accomplishment report "${this.getArLabel(ar)}" has been submitted for review.`,
      'accomplishment_reports',
      ar.id,
      submitterId,
    );

    await this.notifyStageChecker(ar, this.AR_STAGE_ORDER[0], submitterId);
  }

  async notifyArForwarded(
    ar: ReportData,
    actorId: string,
    fromStage: ArStage,
    toStage: ArStage,
  ) {
    if (!ar.user_id) return;

    await this.createNotificationRecord(
      ar.user_id,
      'ar_forwarded',
      'Accomplishment Report Forwarded',
      `Your report "${this.getArLabel(ar)}" was approved by ${this.getStageLabel(fromStage)} and forwarded to ${this.getStageLabel(toStage)}.`,
      'accomplishment_reports',
      ar.id,
      actorId,
    );

    await this.notifyStageChecker(ar, toStage, actorId);
  }

  async notifyArApproved(ar: ReportData, actorId: string) {
    if (!ar.user_id) return;

    await this.createNotificationRecord(
      ar.user_id,
      'ar_approved',
      'Accomplishment Report Approved',
      `Your accomplishment report "${this.getArLabel(ar)}" has been fully approved.`,
      'accomplishment_reports',
      ar.id,
      actorId,
    );
  }

  async notifyArRejected(ar: ReportData, actorId: string, reason?: string) {
    if (!ar.user_id) return;

    await this.createNotificationRecord(
      ar.user_id,
      'ar_rejected',
      'Accomplishment Report Rejected',
      `Your accomplishment report "${this.getArLabel(ar)}" was rejected.${reason ? ` Reason: ${reason}` : ''}`,
      'accomplishment_reports',
      ar.id,
      actorId,
    );
  }

  async notifyArReturned(ar: ReportData, actorId: string, reason?: string) {
    if (!ar.user_id) return;

    await this.createNotificationRecord(
      ar.user_id,
      'ar_returned',
      'Accomplishment Report Returned',
      `Your accomplishment report "${this.getArLabel(ar)}" was returned for revision.${reason ? ` Note: ${reason}` : ''}`,
      'accomplishment_reports',
      ar.id,
      actorId,
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
      'accomplishment_reports',
      ar.id,
      actorId,
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
        await this.notifyArApproved(ar, actorId);
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
          'accomplishment_reports',
          ar.id,
          actorId,
        );
    }
  }

  async notifyPayrollUpdated(payroll: Payroll, actorId: string) {
    await this.createNotificationRecord(
      payroll.employee_id,
      'payroll_updated',
      'Payroll Updated',
      `Your payroll for ${payroll.period} has been updated.`,
      'payrolls',
      payroll.id,
      actorId,
    );
  }

  async notifyPayrollReady(payroll: Payroll, actorId: string) {
    await this.createNotificationRecord(
      payroll.employee_id,
      'payroll_ready',
      'Payroll Ready to be Received',
      `Your payroll for ${payroll.period} has been processed and is ready to be received.`,
      'payrolls',
      payroll.id,
      actorId,
    );
  }

  async notifyPayrollRejected(
    payroll: Payroll,
    actorId: string,
    reason?: string,
  ) {
    await this.createNotificationRecord(
      payroll.employee_id,
      'payroll_rejected',
      'Payroll Not Viable',
      `Your payroll for ${payroll.period} could not be processed.${reason ? ` Reason: ${reason}` : ''}`,
      'payrolls',
      payroll.id,
      actorId,
    );
  }

  async notifyPayrollMoved(
    payroll: Payroll,
    actorId: string,
    fromStatus: PayrollStatus,
    toStatus: PayrollStatus,
  ) {
    await this.createNotificationRecord(
      payroll.employee_id,
      'payroll_moved',
      'Payroll Status Updated',
      `Your payroll for ${payroll.period} moved from ${fromStatus} to ${toStatus}.`,
      'payrolls',
      payroll.id,
      actorId,
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
        await this.notifyPayrollReady(payroll, actorId);
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
          'payrolls',
          payroll.id,
          actorId,
        );
    }
  }

  async fetchNotificationByUser(userId: string, offset: number, limit: number) {
    try {
      const res = await this.db.query(
        `SELECT * FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       OFFSET $2 LIMIT $3`,
        [userId, offset ?? 0, limit ?? 9],
      );
      return SuccessHandler(
        'Successfully fetched user notifications',
        200,
        res.rows,
      );
    } catch (error) {
      if (error instanceof Error) return ErrorHandler(error.message, 500);
      return ErrorHandler('Internal Server Error', 500);
    }
  }

  async insertNotification(
    userId: string,
    payload: Partial<NotificationDto> & { title: string },
  ) {
    try {
      const user = await getUserById(this.db, userId);

      if (!user) return ErrorHandler('User Not Found!', 404);

      const notification = await this.createNotificationRecord(
        userId,
        payload.type as NotificationType,
        payload.title,
        payload.body ?? '',
        payload.entity_type ?? '',
        payload.entity_id ?? null,
        payload.actor_id ?? null,
      );
      return SuccessHandler(
        'Succesfully added notification',
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
      const res = await this.db.query(
        `UPDATE notifications
        SET is_read = true 
        WHERE id = $1 AND user_id = $2
        RETURNING *`,
        [notificationId, userId],
      );

      this.realtimeGateway.emitNotificationRead(userId, notificationId);

      return SuccessHandler('Successfully marked as read', 200, res.rows);
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500);
      }

      return ErrorHandler('Internal Server Error', 500);
    }
  }

  async deleteNotificationByUser(userId: string, notificationId: string) {
    try {
      const res = await this.db.query(
        `SELECT * FROM notifications WHERE user_id = $1 AND id = $2`,
        [userId, notificationId],
      );
      if (res.rowCount === 0)
        return ErrorHandler(`Error Notification Deleted or Doesn't Exist`, 404);

      await this.db.query(
        `DELETE FROM notifications
        WHERE user_id = $1 AND id = $2`,
        [userId, notificationId],
      );

      const notification = res.rows[0] as Notification;

      this.realtimeGateway.emitNotificationDeleted(userId, notificationId);

      return SuccessHandler(
        'Successfully fetched user notifications',
        200,
        notification,
      );
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500);
      }

      return ErrorHandler('Internal Server Error', 500);
    }
  }
}
