
export class UserService {
  constructor(database) {
    this.db = database;
  }

  async createUser(userData) {
    if (!userData.email || !userData.name) {
      throw new Error('Email and name are required');
    }

    const user = {
      id: Date.now(),
      ...userData,
      createdAt: new Date()
    };

    return await this.db.save(user);
  }

  async getUserById(id) {
    const user = await this.db.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async updateUser(id, updates) {
    const user = await this.getUserById(id);
    Object.assign(user, updates);
    user.updatedAt = new Date();
    return await this.db.update(id, user);
  }

  async deleteUser(id) {
    const user = await this.getUserById(id);
    return await this.db.delete(id);
  }

  _validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  _hashPassword(password) {
    // Simulate password hashing
    return 'hashed_' + password;
  }
}
      