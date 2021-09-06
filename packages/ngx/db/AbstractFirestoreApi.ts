import type { DocumentData, DocumentSnapshot, FieldValue, SetOptions, WriteBatch } from '@firebase/firestore';
import { QueryBuilder } from './QueryBuilder';

export abstract class AbstractFirestoreApi {
  // Maximum number of writes that can be passed to a Commit operation
  // or performed in a transaction
  // https://cloud.google.com/firestore/quotas#writes_and_transactions
  BATCH_MAX_WRITES = 500;

  abstract collection<T = any>(collection: string, qb?: QueryBuilder, maxAge?: number): Promise<T[]>;
  abstract doc<T = any>(path: string, maxAge?: number): Promise<T>;

  abstract upsert(collection: string, data: { [key: string]: any }, opts?: SetOptions): Promise<string>;
  abstract update(path: string, data: { [key: string]: any }): Promise<void>;
  abstract delete(path: string): Promise<void>;

  abstract bulkUpsert(collection: string, docs: DocumentData[], opts?: SetOptions): Promise<void>;
  abstract bulkDelete(collection: string, qb?: QueryBuilder): Promise<number>;

  abstract get batch(): WriteBatch;
  abstract get serverTimestamp(): FieldValue;

  abstract increment(n?: number): FieldValue;

  getValueFromSnapshot<T = any>(snapshot: DocumentSnapshot): T {
    return (snapshot.exists ? snapshot.data() : null) as T;
  }
}
