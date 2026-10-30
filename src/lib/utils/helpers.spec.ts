import {
  findDuplicateEmailAcrossRoles,
  findDuplicateUsernameAcrossRoles,
} from './helpers';
import type { Pool } from 'pg';

describe('Cross-role uniqueness validation helpers', () => {
  let mockClient: jest.Mocked<Pick<Pool, 'query'>>;

  beforeEach(() => {
    mockClient = {
      query: jest.fn(),
    };
  });

  describe('findDuplicateEmailAcrossRoles', () => {
    it('returns null if email is empty or whitespace', async () => {
      const result = await findDuplicateEmailAcrossRoles(
        mockClient as unknown as Pool,
        '   ',
      );
      expect(result).toBeNull();
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('queries all three role tables with normalized lowercase email without excludeId', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: '123',
            email: 'admin@school.edu',
            username: 'admin',
            role: 'admin',
            tableName: 'user_admins',
          },
        ],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await findDuplicateEmailAcrossRoles(
        mockClient as unknown as Pool,
        '  Admin@School.Edu  ',
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('user_admins'),
        ['admin@school.edu'],
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('user_professors'),
        ['admin@school.edu'],
      );
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('user_staffs'),
        ['admin@school.edu'],
      );
      expect(result).toEqual({
        id: '123',
        email: 'admin@school.edu',
        username: 'admin',
        role: 'admin',
        tableName: 'user_admins',
      });
    });

    it('passes excludeId parameter when updating', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await findDuplicateEmailAcrossRoles(
        mockClient as unknown as Pool,
        'prof@school.edu',
        'my-current-user-id',
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('id <> $2'),
        ['prof@school.edu', 'my-current-user-id'],
      );
      expect(result).toBeNull();
    });
  });

  describe('findDuplicateUsernameAcrossRoles', () => {
    it('returns null if username is empty or whitespace', async () => {
      const result = await findDuplicateUsernameAcrossRoles(
        mockClient as unknown as Pool,
        '',
      );
      expect(result).toBeNull();
      expect(mockClient.query).not.toHaveBeenCalled();
    });

    it('queries across all three role tables case-insensitively', async () => {
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: '456',
            email: 'staff@school.edu',
            username: 'staffuser',
            role: 'staff',
            tableName: 'user_staffs',
          },
        ],
        rowCount: 1,
        command: '',
        oid: 0,
        fields: [],
      });

      const result = await findDuplicateUsernameAcrossRoles(
        mockClient as unknown as Pool,
        'StaffUser',
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(username) = LOWER($1)'),
        ['StaffUser'],
      );
      expect(result).toEqual({
        id: '456',
        email: 'staff@school.edu',
        username: 'staffuser',
        role: 'staff',
        tableName: 'user_staffs',
      });
    });
  });
});
