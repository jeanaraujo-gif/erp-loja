import 'server-only';
import { db } from './db';
import { stockService } from '../modules/stock/service';
export const stock=stockService(db);
