import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { UserSession } from '../lib/data/interfaces';
import {
  CreateAnnouncementDto,
  ListAnnouncementsDto,
  UpdateAnnouncementDto,
} from './dto/announcements.dto';

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  category: string;
  audience: string;
  is_pinned: boolean;
  status: string;
  published_by?: string | null;
  published_at: Date | null;
  expires_at: Date | null;
  created_at?: Date | null;
  updated_at?: Date | null;
}

@Injectable()
export class AnnouncementsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private get db() {
    return this.databaseService.getClient();
  }

  async listAnnouncements(filters: ListAnnouncementsDto, user?: UserSession) {
    try {
      const values: unknown[] = [];
      const conditions: string[] = [];

      if (filters.category && filters.category !== 'all') {
        values.push(filters.category);
        conditions.push(`category = $${values.length}`);
      }

      if (filters.audience && filters.audience !== 'all') {
        values.push(filters.audience);
        conditions.push(`audience = $${values.length}`);
      }

      if (user?.role === 'admin') {
        if (filters.status && filters.status !== 'all') {
          values.push(filters.status);
          conditions.push(`status = $${values.length}::announcement_status`);
        }
      } else {
        conditions.push(`status = 'sent'`);
        conditions.push(`(expires_at IS NULL OR expires_at > NOW())`);
        conditions.push(`audience = 'Everyone'`);
      }

      if (filters.search && filters.search.trim()) {
        values.push(`%${filters.search.trim().toLowerCase()}%`);
        conditions.push(
          `(LOWER(title) LIKE $${values.length} OR LOWER(body) LIKE $${values.length})`,
        );
      }

      const whereClause =
        conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const result = await this.db.query<AnnouncementRow>(
        `SELECT id, title, body, category, audience, is_pinned, status,
                published_by, published_at, expires_at, created_at, updated_at
           FROM announcements
          ${whereClause}
          ORDER BY is_pinned DESC, COALESCE(published_at, created_at) DESC`,
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

  async getAnnouncement(id: string) {
    try {
      const result = await this.db.query<AnnouncementRow>(
        `SELECT id, title, body, category, audience, is_pinned, status,
                published_by, published_at, expires_at, created_at, updated_at
           FROM announcements
          WHERE id = $1`,
        [id],
      );
      if (result.rows.length === 0) {
        return ErrorHandler('Announcement not found', 404);
      }
      return SuccessHandler(
        'Successfully fetched announcement',
        200,
        this.toResponse(result.rows[0]),
      );
    } catch (error) {
      return ErrorHandler(
        error instanceof Error ? error.message : 'Failed to fetch announcement',
        500,
      );
    }
  }

  async createAnnouncement(user: UserSession, data: CreateAnnouncementDto) {
    try {
      const status = data.status ?? 'sent';
      const result = await this.db.query<AnnouncementRow>(
        `INSERT INTO announcements
          (title, body, category, audience, is_pinned, status, published_by, published_at, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6::announcement_status, $7, CASE WHEN $6 = 'sent' THEN NOW() ELSE NULL END, $8)
         RETURNING id, title, body, category, audience, is_pinned, status,
                   published_by, published_at, expires_at, created_at, updated_at`,
        [
          data.title.trim(),
          data.body.trim(),
          data.category,
          data.audience,
          data.isPinned ?? false,
          status,
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

  async updateAnnouncement(id: string, data: UpdateAnnouncementDto) {
    try {
      const existing = await this.db.query<AnnouncementRow>(
        `SELECT * FROM announcements WHERE id = $1`,
        [id],
      );
      if (existing.rowCount === 0) {
        return ErrorHandler('Announcement not found', 404);
      }

      const current = existing.rows[0];
      const title =
        data.title !== undefined ? data.title.trim() : current.title;
      const body = data.body !== undefined ? data.body.trim() : current.body;
      const category =
        data.category !== undefined ? data.category : current.category;
      const audience =
        data.audience !== undefined ? data.audience : current.audience;
      const isPinned =
        data.isPinned !== undefined ? data.isPinned : current.is_pinned;
      const status =
        data.status !== undefined ? data.status : current.status;
      const expiresAt =
        data.expiresAt !== undefined ? data.expiresAt : current.expires_at;

      const publishedAt =
        status === 'sent' && !current.published_at
          ? new Date()
          : current.published_at;

      const result = await this.db.query<AnnouncementRow>(
        `UPDATE announcements
            SET title = $1,
                body = $2,
                category = $3,
                audience = $4,
                is_pinned = $5,
                status = $6::announcement_status,
                published_at = $7,
                expires_at = $8,
                updated_at = NOW()
          WHERE id = $9
          RETURNING id, title, body, category, audience, is_pinned, status,
                    published_by, published_at, expires_at, created_at, updated_at`,
        [
          title,
          body,
          category,
          audience,
          isPinned,
          status,
          publishedAt,
          expiresAt,
          id,
        ],
      );

      return SuccessHandler(
        'Announcement updated successfully',
        200,
        this.toResponse(result.rows[0]),
      );
    } catch (error) {
      return ErrorHandler(
        error instanceof Error ? error.message : 'Failed to update announcement',
        500,
      );
    }
  }

  async togglePin(id: string, isPinned?: boolean) {
    try {
      const result = await this.db.query<AnnouncementRow>(
        `UPDATE announcements
            SET is_pinned = COALESCE($1, NOT is_pinned),
                updated_at = NOW()
          WHERE id = $2
          RETURNING id, title, body, category, audience, is_pinned, status,
                    published_by, published_at, expires_at, created_at, updated_at`,
        [isPinned !== undefined ? isPinned : null, id],
      );
      if (result.rowCount === 0) {
        return ErrorHandler('Announcement not found', 404);
      }
      return SuccessHandler(
        'Announcement pin status updated',
        200,
        this.toResponse(result.rows[0]),
      );
    } catch (error) {
      return ErrorHandler(
        error instanceof Error ? error.message : 'Failed to toggle pin',
        500,
      );
    }
  }

  async deleteAnnouncement(id: string) {
    try {
      const result = await this.db.query(
        `DELETE FROM announcements WHERE id = $1 RETURNING id`,
        [id],
      );
      if (result.rowCount === 0) {
        return ErrorHandler('Announcement not found', 404);
      }
      return SuccessHandler('Announcement deleted successfully', 200, { id });
    } catch (error) {
      return ErrorHandler(
        error instanceof Error ? error.message : 'Failed to delete announcement',
        500,
      );
    }
  }

  private toResponse(announcement: AnnouncementRow) {
    const category = announcement.category;
    let tone = 'green';
    if (category === 'System') tone = 'amber';
    else if (category === 'AI / ML') tone = 'blue';
    else if (category === 'Urgent') tone = 'red';
    else if (category === 'General') tone = 'gray';

    return {
      id: announcement.id,
      title: announcement.title,
      body: announcement.body,
      tag: announcement.category,
      category: announcement.category,
      audience: announcement.audience,
      pinned: announcement.is_pinned,
      isPinned: announcement.is_pinned,
      tone,
      status: announcement.status,
      publishedAt: announcement.published_at,
      expiresAt: announcement.expires_at,
      createdAt: announcement.created_at ?? announcement.published_at,
      updatedAt: announcement.updated_at ?? announcement.published_at,
      initials: announcement.title.slice(0, 2).toUpperCase(),
      date: announcement.published_at ?? announcement.created_at,
    };
  }
}
