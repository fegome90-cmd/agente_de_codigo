
import { UserComponent } from '../components/UserComponent.js';  // VIOLATION: Business importing from Presentation

export class UserService {
  getUser() {
    return { id: 1, name: 'Test User' };
  }
}
    