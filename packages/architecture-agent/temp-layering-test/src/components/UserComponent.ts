
import { UserService } from '../services/UserService.js';
import { DatabaseService } from '../infrastructure/database/DatabaseService.js';

export class UserComponent {
  constructor(private userService: UserService, private db: DatabaseService) {}

  renderUser() {
    return this.userService.getUser();
  }
}
    