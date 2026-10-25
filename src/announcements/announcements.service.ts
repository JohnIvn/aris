import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { UserSession } from '../lib/data/interfaces';
import {
  CreateAnnouncementDto,
  ListAnnouncementsDto,
} from './dto/announcements.dto';

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  category: string;
  audience: string;
  is_pinned: boolean;
  status: string;
  published_at: Date | null;
  expires_at: Date | null;
}

@Injectable()
export class AnnouncementsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.getClient();
  }

  async listAnnouncements(filters: ListAnnouncementsDto, user?: UserSession) {
    try {
      const values: string[] = [];
      const categoryClause =
        filters.category && filters.category !== 'all'
          ? `AND category = $${values.push(filters.category)}`
          : '';
      const audienceClause =
        user?.role === 'admin' ? '' : `AND audience = 'Everyone'`;

      const result = await this.db.query<AnnouncementRow>(
        `SELECT id, title, body, category, audience, is_pinned, status,
                published_at, expires_at
           FROM announcements
          WHERE status = 'sent'
            AND (expires_at IS NULL OR expires_at > NOW())
            ${categoryClause}
            ${audienceClause}
          ORDER BY is_pinned DESC, published_at DESC`,
        values,
      );

      return SuccessHandler(
        'Successfully fetched announcements',
        200,
        result.rows.map((announcement) => this.toResponse(announcement)),
      );
    } catch (error) {
      return ErrorHandler(
        error instanceof Error ? error.message : 'Failed to fetch announcements',
        500,
      );
    }
  }

  async createAnnouncement(user: UserSession, data: CreateAnnouncementDto) {
    try {
      const result = await this.db.query<AnnouncementRow>(
        `INSERT INTO announcements
          (title, body, category, audience, is_pinned, status, published_by, published_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, 'sent', $6, NOW(), $7)
         RETURNING id, title, body, category, audience, is_pinned, status,
                   published_at, expires_at`,
        [
          data.title.trim(),
          data.body.trim(),
          data.category,
          data.audience,
          data.isPinned ?? false,
          user.id,
          data.expiresAt ?? null,
        ],
      );

      return SuccessHandler(
        'Announcement published successfully',
        201,
        this.toResponse(result.rows[0]),
      );
    } catch (error) {
      return ErrorHandler(
        error instanceof Error ? error.message : 'Failed to publish announcement',
        500,
      );
    }
  }

  private toResponse(announcement: AnnouncementRow) {
    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      tag: announcement.category,
      audience: announcement.audience,
      pinned: announcement.is_pinned,
      tone: announcement.category === 'System'
        ? 'amber'
        : announcement.category === 'AI / ML'
          ? 'blue'
          : 'green',
      status: announcement.status,
      publishedAt: announcement.published_at,
      expiresAt: announcement.expires_at,
      initials: announcement.title.slice(0, 2).toUpperCase(),
      date: announcement.published_at,
    };
  }
}
