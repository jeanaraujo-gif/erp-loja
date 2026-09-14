import 'server-only';
import {db} from './db';
import {salesService} from '../modules/sales/service';
export const sales=salesService(db);
