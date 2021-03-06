import type {
  DocumentData,
  DocumentReference,
  DocumentSnapshot,
  FieldValue,
  QuerySnapshot,
  SetOptions,
  Transaction,
  WriteBatch
} from '@firebase/firestore-types';
import { QueryBuilder } from './QueryBuilder';

export abstract class AbstractFirestoreApi {
  // Maximum number of writes that can be passed to a Commit operation
  // or performed in a transaction
  // https://cloud.google.com/firestore/quotas#writes_and_transactions
  BATCH_MAX_WRITES = 500;

  abstract collection<T = any>(path: string, qb?: QueryBuilder, maxAge?: number): Promise<T[]>;
  abstract collectionGroup<T = any>(collectionId: string, qb?: QueryBuilder, maxAge?: number): Promise<T[]>;
  abstract collectionSnapshot(path: string, qb?: QueryBuilder): Promise<QuerySnapshot<DocumentData>>;
  abstract doc<T = any>(path: string, maxAge?: number): Promise<T>;
  abstract docRef(docPath: string): DocumentReference<DocumentData>;

  abstract upsert(collection: string, data: { [key: string]: any }, opts?: SetOptions): Promise<string>;
  abstract update(docPath: string, data: { [key: string]: any }): Promise<void>;
  abstract delete(docPath: string): Promise<void>;

  abstract bulkUpsert(
    collection: string,
    data: DocumentData[] | { data: DocumentData; qb?: QueryBuilder },
    opts?: SetOptions
  ): Promise<string[]>;
  abstract bulkDelete(collection: string, qb?: QueryBuilder): Promise<string[]>;
  abstract runTransaction(updateFunction: (transaction: Transaction) => Promise<unknown>): Promise<unknown>;

  abstract get batch(): WriteBatch;
  abstract get serverTimestamp(): FieldValue;

  abstract increment(n?: number): FieldValue;

  abstract createId(collection?: string): string;

  getValueFromSnapshot<T = any>(snapshot: DocumentSnapshot): T {
    return (snapshot.exists ? snapshot.data() : null) as T;
  }
}
