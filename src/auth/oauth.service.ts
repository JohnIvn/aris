import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { LoggerService } from '../logger/logger.service';
import { DatabaseService } from '../database/database.service';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { UserData } from '../lib/data/auth.interface';
import { getUserByEmail, getUserByUsername } from '../lib/utils/helpers';
import {
  USER_ROLE_TABLES,
  isUserRole,
  type UserRoles,
} from '../lib/data/types';
import { GoogleSignInDto, GoogleSignUpDto } from './dto/oauth.dto';

// Row shape returned by the queries below (password_hash is never selected)
type OAuthUser = Omit<UserData, 'password_hash' | 'role'> & {
  role: UserRoles;
  is_banned: boolean;
};

interface GoogleProfile {
  email: string;
  firstname: string;
  lastname: string;
  avatar_url: string | null;
}

const USER_COLUMNS = `id, employee_id, username, firstname, middlename, lastname, email,
  avatar_url, birthday, age, gender, position, department, provider,
  is_banned, created_at, updated_at`;

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly googleClient = new OAuth2Client();

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly loggerService: LoggerService,
  ) {}

  private get db() {
    return this.databaseService.getClient();
  }

  private get jwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET is not configured');
    return secret;
  }

  private getUserAge(birthday: string | Date): number {
    const bday = new Date(birthday);
    const curr = new Date();

    let age = curr.getFullYear() - bday.getFullYear();

    const hasBirthdayPassed =
      curr.getMonth() > bday.getMonth() ||
      (curr.getMonth() === bday.getMonth() && curr.getDate() >= bday.getDate());

    if (!hasBirthdayPassed) {
      age--;
    }

    return age;
  }

  private errorResponse(error: unknown) {
    if (error instanceof Error) {
      return ErrorHandler(error.message, 500, error.name);
    }
    return ErrorHandler('Server Error', 500, 'Unknown Error');
  }

  /**
   * Verifies the Google ID token against the client ID for the calling
   * platform. Returns null if the token is invalid or the email is unverified.
   */
  private async verifyGoogleToken(
    idToken: string,
  ): Promise<GoogleProfile | null> {
    const audience = process.env.WEB_GOOGLE_CLIENT_ID;

    if (!audience) {
      throw new Error('WEB_GOOGLE_CLIENT_ID is not configured');
    }

    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience,
      });

      const payload = ticket.getPayload();

      if (!payload?.email || !payload.email_verified) {
        this.logger.warn(
          `Google token has no email or email is unverified (email: ${payload?.email ?? 'none'}, verified: ${String(payload?.email_verified)})`,
        );
        return null;
      }

      const email = payload.email.toLowerCase();

      return {
        email,
        firstname:
          payload.given_name ??
          payload.name ??
          email.slice(0, email.indexOf('@')),
        lastname: payload.family_name ?? '',
        avatar_url: payload.picture ?? null,
      };
    } catch (error) {
      this.logger.warn(
        `Google token verification failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  // SIGNIN
  async mobileGoogleSignIn(dto: GoogleSignInDto) {
    try {
      const metadata = { provider: 'google', platform: dto.platform };

      const profile = await this.verifyGoogleToken(dto.id_token);

      if (!profile) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          auth_action: 'signin',
          role: undefined,
          user_id: undefined,
          metadata,
        });
        return ErrorHandler('Invalid Google token', 401, []);
      }

      const found = await this.db.query<OAuthUser>(
        `
        SELECT 'staff' AS role, ${USER_COLUMNS}
          FROM ${USER_ROLE_TABLES.staff} WHERE LOWER(email) = $1
        UNION ALL
        SELECT 'professor' AS role, ${USER_COLUMNS}
          FROM ${USER_ROLE_TABLES.professor} WHERE LOWER(email) = $1
        LIMIT 1;
        `,
        [profile.email],
      );

      let user: OAuthUser | undefined = found.rows[0];

      if (!user) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          auth_action: 'signin',
          role: undefined,
          user_id: undefined,
          metadata,
        });
        return ErrorHandler('User Not Found', 404, []);
      }

      if (user.is_banned) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          auth_action: 'signin',
          role: user.role,
          user_id: user.id,
          metadata: { ...metadata, reason: 'Account is banned' },
        });
        return ErrorHandler('This account is banned', 403, []);
      }

      // Backfill avatar from Google if the account has none
      if (!user.avatar_url && profile.avatar_url) {
        const updated = await this.db.query<OAuthUser>(
          `
          UPDATE ${USER_ROLE_TABLES[user.role]}
             SET avatar_url = $1, updated_at = NOW()
           WHERE id = $2
          RETURNING ${USER_COLUMNS};
          `,
          [profile.avatar_url, user.id],
        );
        const [row] = updated.rows;
        if (row) user = { ...row, role: user.role };
      }

      const sessionToken = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      const token = await this.jwtService.signAsync(sessionToken, {
        secret: this.jwtSecret,
        expiresIn: '7d',
      });

      await this.loggerService.logAuthAction({
        action_status: 'success',
        auth_action: 'signin',
        role: sessionToken.role,
        user_id: sessionToken.id,
        metadata,
      });

      return SuccessHandler('Successfully Signed In', 200, { user, token });
    } catch (error) {
      return this.errorResponse(error);
    }
  }

  // SIGNUP
  async mobileGoogleSignUp(dto: GoogleSignUpDto) {
    try {
      const profile = await this.verifyGoogleToken(dto.id_token);

      if (!profile) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          auth_action: 'signup',
          role: undefined,
          user_id: undefined,
          metadata: { provider: 'google', platform: dto.platform },
        });
        return ErrorHandler('Invalid Google token', 401, []);
      }

      const username =
        dto.username ?? profile.email.slice(0, profile.email.indexOf('@'));
      const age = dto.birthday ? this.getUserAge(dto.birthday) : null;

      const metadata = {
        email: profile.email,
        firstname: profile.firstname,
        middlename: dto.middlename,
        lastname: profile.lastname,
        birthday: dto.birthday,
        age,
      };

      const emailExists = await getUserByEmail(this.db, profile.email);
      const usernameExists = await getUserByUsername(this.db, username);

      if (emailExists) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          auth_action: 'signup',
          role: undefined,
          user_id: undefined,
          metadata,
        });
        return ErrorHandler('Email already in use', 409, []);
      }

      if (usernameExists) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          auth_action: 'signup',
          role: undefined,
          user_id: undefined,
          metadata,
        });
        return ErrorHandler('Username already in use', 409, []);
      }

      const userRole: UserRoles = isUserRole(dto.role) ? dto.role : 'staff';
      const table = USER_ROLE_TABLES[userRole];

      const response = await this.db.query<OAuthUser>(
        `
        INSERT INTO ${table} (
          employee_id, username, firstname, middlename, lastname, email,
          avatar_url, birthday, age, gender, position, department, provider
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING ${USER_COLUMNS};
        `,
        [
          dto.employee_id,
          username,
          profile.firstname,
          dto.middlename ?? null,
          profile.lastname,
          profile.email,
          profile.avatar_url,
          dto.birthday ?? null,
          age,
          dto.gender ?? null,
          dto.position ?? null,
          dto.department ?? null,
          'google',
        ],
      );

      const [row] = response.rows;

      if (!row) {
        return ErrorHandler('Error signing up, please try again later', 500);
      }

      const user: OAuthUser = { ...row, role: userRole };

      const sessionToken = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      const token = await this.jwtService.signAsync(sessionToken, {
        secret: this.jwtSecret,
        expiresIn: '7d',
      });

      await this.loggerService.logAuthAction({
        action_status: 'success',
        auth_action: 'signup',
        role: user.role,
        user_id: user.id,
        metadata,
      });

      return SuccessHandler('Successfully Registered User', 200, {
        user,
        token,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}
