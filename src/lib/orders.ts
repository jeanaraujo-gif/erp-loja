import 'server-only';
import { db } from './db';
import { ordersService } from '../modules/orders/service';
export const orders = ordersService(db);
