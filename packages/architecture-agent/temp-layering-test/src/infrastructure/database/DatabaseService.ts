
import { UserComponent } from '../../components/UserComponent.js';  // VIOLATION: Infrastructure importing from Presentation
import { UserService } from '../../services/UserService.js';       // VIOLATION: Infrastructure importing from Business

export class DatabaseService {
  connect() {
    return 'Connected to database';
  }
}
    