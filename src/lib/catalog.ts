import 'server-only';
import { db } from './db';
import { catalogService } from '../modules/catalog/service';
export const catalog=catalogService(db);
