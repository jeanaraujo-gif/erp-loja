import 'server-only';
import {db} from './db';
import {customerService} from '../modules/customers/service';
export const customers=customerService(db);
