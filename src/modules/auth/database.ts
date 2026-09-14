export interface Database {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  transaction<T>(fn: (tx: Database) => Promise<T>, options?: {isolationLevel:'Serializable'}): Promise<T>;
}
