
export class AuthService {
  constructor(jwtSecret, userRepository) {
    this.jwtSecret = jwtSecret;
    this.userRepo = userRepository;
  }

  async authenticateUser(email, password) {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await this.verifyPassword(password, user.passwordHash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    return this.generateToken(user);
  }

  async registerUser(userData) {
    const existingUser = await this.userRepo.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('User already exists');
    }

    const hashedPassword = await this.hashPassword(userData.password);
    const user = await this.userRepo.create({
      ...userData,
      passwordHash: hashedPassword
    });

    return this.generateToken(user);
  }

  verifyToken(token) {
    try {
      return this.decodeToken(token);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }

  generateToken(user) {
    // Mock token generation
    return 'jwt_token_' + user.id + '_' + Date.now();
  }

  async hashPassword(password) {
    // Mock password hashing
    return 'hashed_' + password;
  }

  async verifyPassword(password, hash) {
    // Mock password verification
    return hash === 'hashed_' + password;
  }

  decodeToken(token) {
    // Mock token decoding
    return { userId: 123, email: 'test@example.com' };
  }
}
      