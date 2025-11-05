
export class UserService {
  private users: any[] = [];

  createUser(name: string, email: string): void {
    const user = {
      id: Date.now(),
      name: name,
      email: email,
      createdAt: new Date()
    };
    this.users.push(user);
  }

  updateUser(id: number, name: string, email: string): void {
    const user = this.users.find(u => u.id === id);
    if (user) {
      user.name = name;
      user.email = email;
      user.updatedAt = new Date();
    }
  }

  deleteUser(id: number): void {
    this.users = this.users.filter(u => u.id !== id);
  }
}
    