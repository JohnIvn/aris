import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SignInDto, SignUpDto } from './dto/auth.dto';
import { ErrorHandler, SuccessHandler } from '../lib/utils/handlers';
import { UserData } from '../lib/data/auth.interface';
import * as argon2 from 'argon2';
import { JwtService } from '@nestjs/jwt';
import { FastifyReply } from 'fastify';

@Injectable()
export class AuthService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
  ) {}

  private get db() {
    return this.databaseService.getClient();
  }

  private async getUserById(id: string) {
    try {
      return this.db.query(
        `
            SELECT * FROM users
            WHERE id = $1`,
        [id],
      );
    } catch (error) {
      if (error instanceof Error) {
        ErrorHandler(error.message, 500, error);
      }
      ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  private async getUserByEmail(email: string): Promise<UserData | undefined> {
    try {
      const user = await this.db.query(
        `
            SELECT * FROM users
            WHERE email = $1 
            LIMIT 1`,
        [email ?? null],
      );

      return user.rows[0] as UserData;
    } catch (error) {
      if (error instanceof Error) {
        ErrorHandler(error.message, 500, error);
      }
      ErrorHandler('Server Error', 500, 'Unknown Error');
    }
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

  // SIGNIN
  async signIn(reply: FastifyReply, data: SignInDto) {
    try {
      const { email, password } = data;

      const user = await this.getUserByEmail(email);

      if (!user) return ErrorHandler('User Not Found', 404, user);

      const verifyPassword = await argon2.verify(user.password_hash, password);

      if (!verifyPassword) return ErrorHandler('Incorrect Password', 406, []);

      const safeUser = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      const token = await this.jwtService.signAsync(safeUser, {
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

      reply.send({
        message: 'Successfully Signed In',
        data: { user: safeUser, token },
      });
    } catch (error) {
      if (error instanceof Error) {
        ErrorHandler(error.message, 500, error.name);
      }
      ErrorHandler('Server Error', 500, 'Unknown Error');
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
        password,
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
      if (!birthday) errors.push('Birthday is required');

      if (errors.length > 0) {
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
          password_hash,
          username,
          avatar_url,
          age,
          birthday,
          provider,
          role
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *;
      `,
        [
          email,
          firstname,
          lastname,
          middlename,
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
        return ErrorHandler(
          'Error signing up, please try again later',
          500,
          [],
        );

      const user = response.rows[0] as UserData;

      const safeUser = {
        id: user.id,
        email: user.email,
        role: user.role,
      };

      return SuccessHandler('Successfully Registered User', 200, {
        user: safeUser,
      });
    } catch (error) {
      console.error('SIGNUP DATABASE ERROR:', error);
      if (error instanceof Error) {
        ErrorHandler(error.message, 500, error.name);
      }
      ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }

  signout(reply: FastifyReply, token: string) {
    try {
      if (!token)
        ErrorHandler('Error signing out, already signed out', 403, []);

      reply.clearCookie(token);
    } catch (error) {
      if (error instanceof Error) {
        ErrorHandler(error.message, 500, error.name);
      }
      ErrorHandler('Server Error', 500, 'Unknown Error');
    }
  }
}
