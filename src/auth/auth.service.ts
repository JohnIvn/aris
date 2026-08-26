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
import { getUserByEmail, getUserById } from '../lib/utils/helpers';

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

  async verifyUser(user: UserSession, reply: FastifyReply) {
    try {
      const userData = await getUserById(this.db, user.id);

      if (!userData) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          action_type: 'signin',
          role: undefined,
          user_id: undefined,
          metadata: {},
        });
        return ErrorHandler('User Not Found', 404, userData);
      }

      const safeUser = {
        id: userData.id,
        username: userData.username,
        firstname: userData.firstname,
        middlename: userData.middlename,
        lastname: userData.middlename,
        gender: userData.gender,
        birthday: userData.birthday,
        age: userData.age,
        email: userData.email,
      };

      const sessionToken = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      const token = await this.jwtService.signAsync(sessionToken, {
        secret: process.env.JWT_SECRET!,
        expiresIn: 7 * 24 * 60 * 60 * 1000,
      });

      reply.cookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await this.loggerService.logAuthAction({
        action_status: 'success',
        action_type: 'signin',
        role: userData.role,
        user_id: safeUser.id,
        metadata: {},
      });

      reply.send({
        message: 'Successfully Signed In',
        data: { user: safeUser, token },
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
      const { email, password } = data;

      const user = await getUserByEmail(this.db, email);

      if (!user) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          action_type: 'signin',
          role: undefined,
          user_id: undefined,
          metadata: {},
        });
        return ErrorHandler('User Not Found', 404, user);
      }

      const verifyPassword = await argon2.verify(user.password_hash, password);

      if (!verifyPassword) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          action_type: 'signin',
          role: user.role,
          user_id: user.id,
          metadata: {},
        });
        return ErrorHandler('Incorrect Password', 406, []);
      }

      const safeUser = {
        id: user.id,
        username: user.username,
        firstname: user.firstname,
        middlename: user.middlename,
        lastname: user.middlename,
        gender: user.gender,
        birthday: user.birthday,
        age: user.age,
        email: user.email,
      };

      const sessionToken = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      const token = await this.jwtService.signAsync(sessionToken, {
        secret: process.env.JWT_SECRET!,
        expiresIn: 7 * 24 * 60 * 60 * 1000,
      });

      reply.cookie('token', token, {
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      await this.loggerService.logAuthAction({
        action_status: 'success',
        action_type: 'signin',
        role: sessionToken.role,
        user_id: safeUser.id,
        metadata: {},
      });

      reply.send({
        message: 'Successfully Signed In',
        data: { user: safeUser, token },
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
          action_type: 'signup',
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

      const response = await this.db.query(
        `
        INSERT INTO users (
          email,
          firstname,
          lastname,
          middlename,
          gender,
          password_hash,
          username,
          avatar_url,
          age,
          birthday,
          provider,
          role
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING *;
      `,
        [
          email,
          firstname,
          lastname,
          middlename,
          gender,
          password_hash,
          username,
          avatar_url,
          birthday && this.getUserAge(birthday),
          birthday,
          provider ?? 'local',
          role ?? 'employee',
        ],
      );

      if (response.rowCount === 0)
        return ErrorHandler('Error signing up, please try again later', 500);

      const user = response.rows[0] as UserData;

      const safeUser = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      await this.loggerService.logAuthAction({
        action_status: 'success',
        action_type: 'signup',
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

  async signOut(user: UserSession, reply: FastifyReply, token: string) {
    try {
      if (!token) {
        await this.loggerService.logAuthAction({
          action_status: 'failure',
          action_type: 'signout',
          role: user.role,
          user_id: user.id,
          metadata: {
            reason: 'Token does not exist',
            code: 400,
          },
        });
        return ErrorHandler('Error signing out, already signed out', 403, []);
      }

      await this.loggerService.logAuthAction({
        action_status: 'success',
        action_type: 'signout',
        role: user.role,
        user_id: user.id,
        metadata: {},
      });
      reply.clearCookie(token);
    } catch (error) {
      if (error instanceof Error) {
        return ErrorHandler(error.message, 500, error.name);
      }
      return ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}
