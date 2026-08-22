import { Injectable, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import { createEnumTypes } from './models/enums.model';
import { createUsers } from './models/users.model';
import { createAuthLogs } from './models/auth_logs.model';

dotenv.config();

console.log(chalk.bgBlue.black('[SERVICE] Database service loaded'));

@Injectable()
export class DatabaseService implements OnModuleInit {
  private pool: Pool;
  private connectionString: string;

  constructor() {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      console.error(
        chalk.red.bold('DATABASE_URL is not defined in environment variables'),
      );
      throw new Error('DATABASE_URL is missing');
    }

    this.connectionString = connectionString;

    this.pool = new Pool({
      connectionString,
      ssl:
        process.env.NODE_ENV === 'production'
          ? { rejectUnauthorized: true }
          : false,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    });

    this.pool.on('error', (error) => {
      console.error(chalk.red.bold('[DATABASE POOL ERROR]'), error.message);
    });

    console.log(chalk.blueBright('Database client initialized.'));
  }

  async onModuleInit() {
    console.log(chalk.yellow('Connecting to the database...'));

    try {
      await this.pool.query('SELECT 1');
      console.log(chalk.green('Connected to the database!'));

      const dbUrl = (() => {
        try {
          const url = new URL(this.connectionString);
          return `${url.protocol}//${url.hostname}:${url.port}${url.pathname}`;
        } catch {
          return 'database';
        }
      })();
      console.log(chalk.blueBright(`Connected to ${dbUrl}`));

      console.log(chalk.cyan('Creating tables...'));

      await createEnumTypes(this.pool);
      await createUsers(this.pool);
      await createAuthLogs(this.pool);
      console.log(chalk.bgGreen.black('[SUPABASE] All tables are ready!'));
    } catch (error) {
      console.error(
        chalk.red.bold('Failed to initialize database:'),
        error instanceof Error ? error.message : error,
      );
      throw error;
    }
  }

  getClient(): Pool {
    return this.pool;
  }
}
