
import { UserService } from '../../src/services/UserService.js';

describe('UserService', () => {
  let userService;
  let mockDatabase;

  beforeEach(() => {
    mockDatabase = {
      save: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      delete: jest.fn()
    };
    userService = new UserService(mockDatabase);
  });

  describe('createUser', () => {
    test('should create user with valid data', async () => {
      const userData = { email: 'test@example.com', name: 'Test User' };
      mockDatabase.save.mockResolvedValue({ id: 1, ...userData });

      const result = await userService.createUser(userData);

      expect(mockDatabase.save).toHaveBeenCalled();
      expect(result.id).toBe(1);
      expect(result.email).toBe(userData.email);
    });

    test('should throw error when email is missing', async () => {
      const userData = { name: 'Test User' };

      await expect(userService.createUser(userData))
        .rejects.toThrow('Email and name are required');
    });
  });

  describe('getUserById', () => {
    test('should return user when found', async () => {
      const user = { id: 1, email: 'test@example.com' };
      mockDatabase.findById.mockResolvedValue(user);

      const result = await userService.getUserById(1);

      expect(result).toBe(user);
    });

    test('should throw error when user not found', async () => {
      mockDatabase.findById.mockResolvedValue(null);

      await expect(userService.getUserById(999))
        .rejects.toThrow('User not found');
    });
  });
});
      