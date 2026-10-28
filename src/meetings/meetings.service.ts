import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { SaveMeetingDto } from './dto/meetings.dto';
import type { UserSession } from '../lib/data/interfaces';

@Injectable()
export class MeetingsService {
  constructor(private readonly databaseService: DatabaseService) {}

  private async resolveProfessorId(
    user?: UserSession,
    dtoEmail?: string,
    dtoProfId?: string,
  ): Promise<string | null> {
    const client = this.databaseService.getClient();

    if (user?.id) {
      const res = await client.query(
        'SELECT id FROM user_professors WHERE id = $1 LIMIT 1',
        [user.id],
      );
      if (res.rows.length > 0) return res.rows[0].id;
    }

    if (dtoProfId) {
      const res = await client.query(
        'SELECT id FROM user_professors WHERE id = $1 LIMIT 1',
        [dtoProfId],
      );
      if (res.rows.length > 0) return res.rows[0].id;
    }

    const email = user?.email || dtoEmail;
    if (email) {
      const res = await client.query(
        'SELECT id FROM user_professors WHERE LOWER(email) = LOWER($1) LIMIT 1',
        [email.trim()],
      );
      if (res.rows.length > 0) return res.rows[0].id;
    }

    return null;
  }

  async saveMeeting(user: UserSession, dto: SaveMeetingDto) {
    try {
      const client = this.databaseService.getClient();
      const professorId = await this.resolveProfessorId(
        user,
        dto.user_email,
        dto.professor_id,
      );

      const name =
        dto.name?.trim() || dto.title?.trim() || 'Google Meet Session';
      const meetingCode =
        dto.meeting_code?.trim() || dto.code?.trim() || 'unknown';
      const meetingUrl =
        dto.meeting_url?.trim() ||
        dto.url?.trim() ||
        (meetingCode ? `https://meet.google.com/${meetingCode}` : '');
      const course = dto.course?.trim() || 'General Consultation';

      let startedAtDate: Date;
      if (dto.started_at) {
        startedAtDate =
          typeof dto.started_at === 'number'
            ? new Date(dto.started_at)
            : new Date(String(dto.started_at));
      } else {
        startedAtDate = new Date();
      }
      if (isNaN(startedAtDate.getTime())) startedAtDate = new Date();

      let endedAtDate: Date;
      if (dto.ended_at) {
        endedAtDate =
          typeof dto.ended_at === 'number'
            ? new Date(dto.ended_at)
            : new Date(String(dto.ended_at));
      } else {
        endedAtDate = new Date();
      }
      if (isNaN(endedAtDate.getTime())) endedAtDate = new Date();

      let durationSecs = dto.duration_seconds;
      if (durationSecs === undefined || durationSecs === null) {
        durationSecs = Math.max(
          0,
          Math.floor((endedAtDate.getTime() - startedAtDate.getTime()) / 1000),
        );
      }

      let durationMins = dto.duration_minutes;
      if (durationMins === undefined || durationMins === null) {
        durationMins = Math.max(0, Math.ceil(durationSecs / 60));
      }

      const meetingDate =
        dto.meeting_date || startedAtDate.toISOString().split('T')[0];
      const startTime =
        dto.start_time || startedAtDate.toTimeString().split(' ')[0];
      const endTime = dto.end_time || endedAtDate.toTimeString().split(' ')[0];
      const info = dto.info || null;

      const transcriptJson = dto.transcript ? JSON.stringify(dto.transcript) : null;
      const transcriptSource =
        dto.transcript_source ||
        (Array.isArray(dto.transcript)
          ? dto.transcript.map((t: any) => `${t.t || ''} - ${t.who || ''}: ${t.text || ''}`).join('\n')
          : null);
      const participantsJson = dto.participants ? JSON.stringify(dto.participants) : null;
      const wordCount =
        dto.word_count ||
        (transcriptSource ? transcriptSource.split(/\s+/).filter(Boolean).length : 0);

      let status = (dto.status || (dto.transcript ? 'summarized' : 'completed')).toLowerCase();

      // Prevent rapid duplicate inserts for the same meeting code within 30 seconds
      if (meetingCode && meetingCode !== 'unknown') {
        const recentCheck = await client.query(
          `
          SELECT * FROM meeting_records
           WHERE meeting_code = $1
             AND (professor_id = $2 OR ($2 IS NULL AND professor_id IS NULL))
             AND created_at >= NOW() - INTERVAL '30 seconds'
           ORDER BY created_at DESC
           LIMIT 1
          `,
          [meetingCode, professorId],
        );
        if (recentCheck.rows.length > 0) {
          if (dto.transcript && (!recentCheck.rows[0].transcript || (Array.isArray(recentCheck.rows[0].transcript) && recentCheck.rows[0].transcript.length === 0))) {
            const updateRes = await client.query(
              `UPDATE meeting_records
                  SET transcript = $1,
                      transcript_source = $2,
                      participants = COALESCE($3, participants),
                      word_count = $4,
                      status = 'summarized'
                WHERE id = $5
            RETURNING *`,
              [transcriptJson, transcriptSource, participantsJson, wordCount, recentCheck.rows[0].id],
            );
            return SuccessHandler('Meeting recorded successfully', 200, updateRes.rows[0]);
          }
          return SuccessHandler('Meeting recorded successfully', 200, recentCheck.rows[0]);
        }
      }

      // Check if status is a valid meeting_status enum
      let recordRow: Record<string, unknown> | null = null;
      try {
        const insertQuery = `
          INSERT INTO meeting_records (
            professor_id,
            name,
            course,
            meeting_code,
            meeting_url,
            meeting_date,
            start_time,
            end_time,
            started_at,
            ended_at,
            duration_minutes,
            duration_seconds,
            status,
            info,
            transcript,
            transcript_source,
            participants,
            word_count
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
          )
          RETURNING *;
        `;

        const res = await client.query(insertQuery, [
          professorId,
          name,
          course,
          meetingCode,
          meetingUrl,
          meetingDate,
          startTime,
          endTime,
          startedAtDate,
          endedAtDate,
          durationMins,
          durationSecs,
          status,
          info,
          transcriptJson,
          transcriptSource,
          participantsJson,
          wordCount,
        ]);
        recordRow = res.rows[0];
      } catch (err: unknown) {
        // Fallback in case status enum 'completed' is not accepted by older db enum definition
        const errMsg = err instanceof Error ? err.message : String(err);
        if (errMsg.includes('meeting_status') || errMsg.includes('enum')) {
          status = 'summarized';
          const fallbackRes = await client.query(
            `
            INSERT INTO meeting_records (
              professor_id,
              name,
              course,
              meeting_code,
              meeting_url,
              meeting_date,
              start_time,
              end_time,
              started_at,
              ended_at,
              duration_minutes,
              duration_seconds,
              status,
              info,
              transcript,
              transcript_source,
              participants,
              word_count
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
            )
            RETURNING *;
          `,
            [
              professorId,
              name,
              course,
              meetingCode,
              meetingUrl,
              meetingDate,
              startTime,
              endTime,
              startedAtDate,
              endedAtDate,
              durationMins,
              durationSecs,
              status,
              info,
              transcriptJson,
              transcriptSource,
              participantsJson,
              wordCount,
            ],
          );
          recordRow = fallbackRes.rows[0];
        } else {
          throw err;
        }
      }

      // Log the meeting action into meeting_logs
      if (recordRow) {
        try {
          await client.query(
            `
            INSERT INTO meeting_logs (
              action_type,
              action_status,
              professor_id,
              meeting_id,
              user_id,
              metadata
            ) VALUES (
              'create_meeting',
              'success',
              $1,
              $2,
              $3,
              $4
            )
          `,
            [
              professorId,
              recordRow.id,
              user?.id || professorId,
              JSON.stringify({
                meeting_code: meetingCode,
                duration_seconds: durationSecs,
                duration_minutes: durationMins,
                time_in: startedAtDate.toISOString(),
                time_out: endedAtDate.toISOString(),
                saved_by: user?.email || dto.user_email,
                course,
              }),
            ],
          );
        } catch {
          // Non-blocking log failure
        }
      }

      return SuccessHandler('Meeting recorded successfully', 201, recordRow);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async fetchMeetings(user: UserSession, offset = 0, limit = 50) {
    try {
      const client = this.databaseService.getClient();
      const professorId = await this.resolveProfessorId(user);

      let query = `
        SELECT mr.*,
               up.firstname,
               up.lastname,
               up.email AS professor_email
          FROM meeting_records mr
          LEFT JOIN user_professors up ON mr.professor_id = up.id
      `;
      const params: unknown[] = [];

      if (user?.role === 'professor' && professorId) {
        query += ` WHERE (mr.professor_id = $1 OR mr.professor_id IS NULL) `;
        params.push(professorId);
      }

      query += ` ORDER BY mr.started_at DESC NULLS LAST, mr.created_at DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const res = await client.query(query, params);
      return SuccessHandler('Meetings retrieved', 200, res.rows);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async fetchSummaries(user: UserSession, offset = 0, limit = 50) {
    try {
      const client = this.databaseService.getClient();
      const professorId = await this.resolveProfessorId(user);

      let query = `
        SELECT mr.*,
               up.firstname,
               up.lastname,
               up.email AS professor_email
          FROM meeting_records mr
          LEFT JOIN user_professors up ON mr.professor_id = up.id
      `;
      const params: unknown[] = [];

      if (user?.role === 'professor' && professorId) {
        query += ` WHERE (mr.professor_id = $1 OR mr.professor_id IS NULL) `;
        params.push(professorId);
      }

      query += ` ORDER BY mr.started_at DESC NULLS LAST, mr.created_at DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const res = await client.query(query, params);

      const summaries = res.rows.map((row) => {
        const profName =
          row.firstname && row.lastname
            ? `${row.firstname} ${row.lastname}`
            : row.professor_email || 'Professor';

        const durationMins =
          row.duration_minutes ||
          (row.duration_seconds ? Math.ceil(row.duration_seconds / 60) : 0);
        let durationFormatted = '0m';
        if (durationMins >= 60) {
          const h = Math.floor(durationMins / 60);
          const m = durationMins % 60;
          durationFormatted = `${h}h ${m.toString().padStart(2, '0')}m`;
        } else {
          durationFormatted = `${durationMins}m`;
        }

        const wordsCount = row.word_count || Math.max(50, durationMins * 110);
        const wordsFormatted = `${wordsCount.toLocaleString()} words`;

        const startStr = row.started_at ? new Date(row.started_at) : null;
        const endStr = row.ended_at ? new Date(row.ended_at) : null;
        const timeDisplay =
          startStr &&
          endStr &&
          !isNaN(startStr.getTime()) &&
          !isNaN(endStr.getTime())
            ? `${startStr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endStr.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
            : `${row.start_time || ''} – ${row.end_time || ''}`;

        let dateDisplay = 'Recent';
        if (row.meeting_date) {
          const d = new Date(row.meeting_date);
          dateDisplay = !isNaN(d.getTime())
            ? d.toLocaleDateString(undefined, {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })
            : String(row.meeting_date);
        } else if (startStr && !isNaN(startStr.getTime())) {
          dateDisplay = startStr.toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });
        }

        let parsedParticipants = Array.isArray(row.participants) ? row.participants : null;
        if (!parsedParticipants && typeof row.participants === 'string') {
          try {
            const p = JSON.parse(row.participants);
            if (Array.isArray(p)) parsedParticipants = p;
          } catch {}
        }

        const participants =
          parsedParticipants && parsedParticipants.length > 0
            ? parsedParticipants
            : [profName, 'Class Consultation'];

        const overview =
          row.overview?.trim() ||
          (row.info
            ? row.info
            : `Session recorded via Google Meet under code ${row.meeting_code || 'N/A'}. Call duration: ${durationFormatted}. Transcribed and logged for Accomplishment Reporting.`);

        const keyPoints =
          Array.isArray(row.key_points) && row.key_points.length > 0
            ? row.key_points
            : [
                `Google Meet session conducted under code ${row.meeting_code || 'N/A'}.`,
                `Recorded duration: ${durationFormatted} (${wordsFormatted}).`,
                `Course / topic: ${row.course || row.name}.`,
              ];

        const decisions =
          Array.isArray(row.decisions) && row.decisions.length > 0
            ? row.decisions
            : [
                `Consultation session logged in database for Accomplishment Report validation.`,
              ];

        const actions =
          Array.isArray(row.action_items) && row.action_items.length > 0
            ? row.action_items
            : [
                {
                  owner: profName,
                  task: `Review session details for ${row.name || 'meeting'}`,
                  due: dateDisplay,
                },
              ];

        let parsedTranscript: { t: string; who: string; text: string }[] | null = null;
        if (Array.isArray(row.transcript)) {
          parsedTranscript = row.transcript;
        } else if (typeof row.transcript === 'string') {
          try {
            const parsed = JSON.parse(row.transcript);
            if (Array.isArray(parsed)) parsedTranscript = parsed;
          } catch {}
        }

        const transcript =
          parsedTranscript && parsedTranscript.length > 0
            ? parsedTranscript
            : row.transcript_source
            ? row.transcript_source
                .split('\n')
                .filter(Boolean)
                .map((line: string) => {
                  const match = line.match(/^(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*-\s*([^:]+):\s*(.*)$/i);
                  if (match) {
                    return { t: match[1].trim(), who: match[2].trim(), text: match[3].trim() };
                  }
                  return {
                    t: timeDisplay.split('–')[0]?.trim() || 'Start',
                    who: profName,
                    text: line.trim(),
                  };
                })
            : [
                {
                  t: timeDisplay.split('–')[0]?.trim() || 'Start',
                  who: profName,
                  text: `Meeting session started. Code: ${row.meeting_code || 'N/A'}. Duration: ${durationFormatted}.`,
                },
                {
                  t: timeDisplay.split('–')[1]?.trim() || 'End',
                  who: 'System',
                  text: `Call completed and logged to PostgreSQL.`,
                },
              ];

        return {
          id: row.id,
          title: row.name,
          course: row.course || 'General Consultation',
          date: dateDisplay,
          time: timeDisplay,
          duration: durationFormatted,
          participants,
          words: wordsFormatted,
          status: 'Summarized',
          overview,
          keyPoints,
          decisions,
          actions,
          transcript,
          meeting_code: row.meeting_code,
          meeting_url: row.meeting_url,
          created_at: row.created_at,
        };
      });

      return SuccessHandler('Meeting summaries retrieved', 200, summaries);
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async deleteMeeting(user: UserSession, id: string) {
    try {
      const client = this.databaseService.getClient();
      await client.query('DELETE FROM meeting_records WHERE id = $1', [id]);
      return SuccessHandler('Meeting deleted', 200, { id });
    } catch (error) {
      return error instanceof Error
        ? ErrorHandler(error.message, 500, error.name)
        : ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}
