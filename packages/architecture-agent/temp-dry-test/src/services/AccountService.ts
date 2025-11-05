
export class AccountService {
  private accounts: any[] = [];

  createAccount(name: string, email: string): void {
    const account = {
      id: Date.now(),
      name: name,
      email: email,
      createdAt: new Date()
    };
    this.accounts.push(account);
  }

  updateAccount(id: number, name: string, email: string): void {
    const account = this.accounts.find(a => a.id === id);
    if (account) {
      account.name = name;
      account.email = email;
      account.updatedAt = new Date();
    }
  }

  deleteAccount(id: number): void {
    this.accounts = this.accounts.filter(a => a.id !== id);
  }
}
    