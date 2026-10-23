import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SignInDto, SignUpDto } from './dto/auth.dto';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { UserData } from '../lib/data/auth.interface';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { FastifyReply } from 'fastify';
import { LoggerService } from '../logger/logger.service';
import { UserSession } from '../lib/data/interfaces';
import {
  getUserByEmail,
  getUserById,
  getUserByUsername,
} from '../lib/utils/helpers';

import {
  USER_ROLE_TABLES,
  isUserRole,
  type UserRoles,
} from '../lib/data/types';

type RoleTable = (typeof USER_ROLE_TABLES)[keyof typeof USER_ROLE_TABLES];

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly loggerService: LoggerService,
  ) {}

  private get db() {
    return this.databaseService.getClient();
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

  private toSafeUser(user: UserData) {
    return {
      id: user.id,
      email: user.email,
      name: [user.firstname, user.lastname].filter(Boolean).join(' '),
      role: user.role,
      avatar_url: user.avatar_url,
      username: user.username,
      firstname: user.firstname,
      middlename: user.middlename,
      lastname: user.lastname,
      gender: user.gender,
      birthday: user.birthday,
      age: user.age,
    };
  }

  private async createToken(user: UserData) {
    return this.jwtService.signAsync(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      {
        secret: process.env.JWT_SECRET!,
        issuer: 'aris-auth',
        audience: 'aris-web',
        expiresIn: '7d',
      },
    );
  }

  private recordAuthLog(data: Parameters<LoggerService['logAuthAction']>[0]) {
    void this.loggerService.logAuthAction(data).catch((error: unknown) => {
      console.error(
        '[AUTH LOGGING ERROR]',
        error instanceof Error ? error.message : error,
      );
    });
  }

  async verifyUser(user: UserSession, reply: FastifyReply) {
    try {
      const userData = await getUserById(this.db, user.id);

      if (!userData) {
        this.recordAuthLog({
          action_status: 'failure',
          auth_action: 'signin',
          role: undefined,
          user_id: undefined,
          metadata: {},
        });
        return ErrorHandler('User Not Found', 404, userData);
      }

      const safeUser = this.toSafeUser(userData);
      const token = await this.createToken(userData);

      reply.cookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      this.recordAuthLog({
        action_status: 'success',
        auth_action: 'signin',
        role: userData.role,
        user_id: userData.id,
        metadata: {},
      });

      return SuccessHandler('Successfully Signed In', 200, {
        user: safeUser,
        token,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  // SIGNIN
  async signIn(reply: FastifyReply, data: SignInDto) {
    try {
      const { password } = data;
      const email = data.email.trim().toLowerCase();

      let user = (
        await this.db.query<UserData>(
          `
          SELECT
            id,
            email,
            password_hash,
            username,
            firstname,
            middlename,
            lastname,
            avatar_url,
            birthday,
            age,
            gender,
            is_banned,
            'admin'::text AS role
          FROM user_admins
          WHERE LOWER(email) = $1
          LIMIT 1
        `,
          [email],
        )
      ).rows[0];

      if (!user) {
        user = (await getUserByEmail(this.db, email)) as UserData;
      }

      if (!user) {
        this.recordAuthLog({
          action_status: 'failure',
          auth_action: 'signin',
          role: undefined,
          user_id: undefined,
          metadata: {},
        });
        return ErrorHandler('Account does not exist', 404, null);
      }

      if (user.is_banned) {
        return ErrorHandler('This account is banned', 403, null);
      }

      if (!user.password_hash) {
        return ErrorHandler('Account password is not configured', 500, null);
      }

      const verifyPassword = await argon2.verify(user.password_hash, password);

      if (!verifyPassword) {
        this.recordAuthLog({
          action_status: 'failure',
          auth_action: 'signin',
          role: user.role,
          user_id: user.id,
          metadata: {},
        });
        return ErrorHandler('Incorrect Password', 406, []);
      }

      const safeUser = this.toSafeUser(user);
      const token = await this.createToken(user);

      reply.cookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      this.recordAuthLog({
        action_status: 'success',
        auth_action: 'signin',
        role: user.role,
        user_id: user.id,
        metadata: {},
      });

      return SuccessHandler('Successfully Signed In', 200, {
        user: safeUser,
        token,
      });
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  // SIGNUP
  async signUp(data: SignUpDto) {
    try {
      const {
        email,
        employee_id,
        firstname,
        lastname,
        middlename,
        gender,
        password,
        confirm_password,
        username,
        avatar_url,
        birthday,
        provider,
        role,
      } = data;

      const errors = [] as string[];

      const emailExists = await getUserByEmail(this.db, email);
      const usernameExists = await getUserByUsername(this.db, username);

      if (emailExists) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          auth_action: 'signup',
          role: undefined,
          user_id: undefined,
          metadata: {
            email: email,
            firstname: firstname,
            middlename: middlename,
            lastname: lastname,
            birthday: birthday,
            age: birthday ? this.getUserAge(birthday) : null,
          },
        });
        return ErrorHandler('Email already in use', 409, errors);
      }

      if (usernameExists) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          auth_action: 'signup',
          role: undefined,
          user_id: undefined,
          metadata: {
            email: email,
            firstname: firstname,
            middlename: middlename,
            lastname: lastname,
            birthday: birthday,
            age: birthday ? this.getUserAge(birthday) : null,
          },
        });
        return ErrorHandler('Username already in use', 409, errors);
      }
      if (!email) errors.push('Email is required');
      if (!password) errors.push('Password is required');
      if (!username) errors.push('Username is required');
      if (!firstname) errors.push('Firstname is required');
      if (!lastname) errors.push('Lastname is required');
      if (password !== confirm_password)
        errors.push('Password and Confirm Password does not match');

      if (errors.length > 0) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          auth_action: 'signup',
          role: undefined,
          user_id: undefined,
          metadata: {
            email: email,
            firstname: firstname,
            middlename: middlename,
            lastname: lastname,
            birthday: birthday,
            age: birthday ? this.getUserAge(birthday) : null,
          },
        });
        return ErrorHandler('Missing required credentials', 400, errors);
      }

      const password_hash = await argon2.hash(password);

      const userRole: UserRoles = isUserRole(role) ? role : 'staff';
      const table: RoleTable = USER_ROLE_TABLES[userRole];
      const employeeId = employee_id ?? username;

      const response = await this.db.query(
        `
        INSERT INTO ${table} (
          email,
          employee_id,
          firstname,
          lastname,
          middlename,
          gender,
          password_hash,
          username,
          avatar_url,
          age,
          birthday,
          provider
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *;
      `,
        [
          email,
          employeeId,
          firstname,
          lastname,
          middlename,
          gender,
          password_hash,
          username,
          avatar_url,
          birthday ? this.getUserAge(birthday) : null,
          birthday,
          provider ?? 'local',
        ],
      );

      if (response.rowCount === 0)
        return ErrorHandler('Error signing up, please try again later', 500);

      const user = response.rows[0] as UserData;
      user.role = userRole;

      const safeUser = {
        avatar_url: user.avatar_url,
        username: user.username,
        firstname: user.firstname,
        middlename: user.middlename,
        lastname: user.lastname,
        gender: user.gender,
        birthday: user.birthday,
        age: user.age,
        email: user.email,
      };

      await this.loggerService.logAuthAction({
        action_status: 'success',
        auth_action: 'signup',
        role: user.role,
        user_id: user.id,
        metadata: {
          email: email,
          firstname: firstname,
          middlename: middlename,
          lastname: lastname,
          birthday: birthday,
          age: birthday ? this.getUserAge(birthday) : null,
        },
      });
      return SuccessHandler('Successfully Registered User', 200, {
        user: safeUser,
      });
    } catch (error) {
      console.error('SIGNUP DATABASE ERROR:', error);
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  async signOut(user: UserSession, reply: FastifyReply, token?: string) {
    try {
      reply.clearCookie('token', {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
      });

      await this.loggerService.logAuthAction({
        action_status: 'success',
        auth_action: 'signout',
        role: user.role,
        user_id: user.id,
        metadata: {
          token: token ?? null,
        },
      });

      return SuccessHandler('Successfully Signed Out', 200, null);
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}
