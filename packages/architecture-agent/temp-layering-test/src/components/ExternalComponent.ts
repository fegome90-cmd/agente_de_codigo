
import lodash from 'lodash';  // Forbidden
import moment from 'moment';  // Forbidden
import axios from 'axios';    // Allowed
import { customLib } from 'some-custom-package';  // Not in allowlist

export class ExternalComponent {
  constructor() {
    const data = lodash.cloneDeep({});
    const time = moment().format();
    const response = axios.get('/api/data');
  }
}
    