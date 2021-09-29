import type {
  QuerySnapshot,
  WriteBatch,
  DocumentData,
  SetOptions,
  DocumentReference,
  FirebaseFirestore,
  Transaction
} from '@firebase/firestore-types';

import { AbstractFirestoreApi, QueryBuilder } from '../../ngx/db';
import { arrayToChunks } from '../utils';

type Firestore = FirebaseFirestore;

export class FirestoreCloudService extends AbstractFirestoreApi {
  private db: Firestore;
  private admin: any;

  private static instance: FirestoreCloudService = null;

  static getInstance(admin: any) {
    this.instance ??= new this();
    this.instance.initialize(admin);

    return this.instance;
  }

  initialize(admin: any) {
    admin.initializeApp();

    this.db = admin.firestore();
    this.admin = admin;
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Abstract members
  // -----------------------------------------------------------------------------------------------------
  async collection<T = any>(collection: string, qb?: QueryBuilder): Promise<T[]> {
    return (await this.collectionSnapshot(collection, qb)).docs.map((doc) => ({ id: doc.id, ...doc.data() } as any));
  }

  async collectionGroup<T = any>(collectionId: string, qb?: QueryBuilder): Promise<T[]> {
    return (await this.collectionGroupSnapshot(collectionId, qb)).docs.map(
      (doc) => ({ id: doc.id, ...doc.data() } as any)
    );
  }

  async doc<T = any>(path: string): Promise<T> {
    const snapshot = await this.docRef(path).get();
    return (snapshot.exists && ({ id: snapshot.id, ...snapshot.data() } as any)) || null;
  }

  async upsert(collection: string, data: { [key: string]: any }, opts: SetOptions = { merge: true }) {
    const timestamp = this.serverTimestamp;

    // eslint-disable-next-line prefer-const
    let { id, ...updata } = data;
    if (!id) {
      id = this.db.collection(collection).doc().id;
      updata.createdTs = timestamp;
    }

    updata.updatedTs = timestamp;
    await this.docRef(`${collection}/${id}`).set(Object.assign({}, updata), opts);

    return id;
  }

  async update(path: string, data: { [key: string]: any }) {
    await this.docRef(path).update(data);
  }

  async delete(path: string) {
    await this.docRef(path).delete();
  }

  /**
   * Bulk update data
   */
  async bulkUpsert(collection: string, docs: DocumentData[]) {
    // Due to a batch limitation, need to split docs array into chunks
    for (const chunks of arrayToChunks(docs, this.BATCH_MAX_WRITES)) {
      const batch = this.batch;

      chunks.forEach((doc) => {
        let { id, ...updata } = doc;
        id ??= this.db.collection(collection).doc().id;

        batch.set(this.docRef(`${collection}/${id}`), updata, { merge: true });
      });
      await batch.commit();
    }
  }

  /**
   * Bulk delete data
   */
  async bulkDelete(collection: string, qb?: QueryBuilder, maxSize = 1000) {
    if (!qb) {
      qb = new QueryBuilder();
      qb.limit(maxSize);
    }

    const snapshot: QuerySnapshot = await this.collectionSnapshot(collection, qb);

    let totalCount = 0;

    // Due to a batch limitation, need to split docs array into chunks
    for (const chunks of arrayToChunks(snapshot.docs, this.BATCH_MAX_WRITES)) {
      const batch = this.batch;

      chunks.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      totalCount += chunks.length;
    }

    return totalCount;
  }

  get batch(): WriteBatch {
    return this.db.batch();
  }

  get serverTimestamp() {
    return this.admin.firestore.FieldValue.serverTimestamp();
  }

  increment(n = 1) {
    return this.admin.firestore.FieldValue.increment(n);
  }

  runTransaction(updateFunction: (transaction: Transaction) => Promise<unknown>): Promise<unknown> {
    return this.db.runTransaction(updateFunction);
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Custom methods
  // -----------------------------------------------------------------------------------------------------

  /**
   * Create a Firestore Timestamp
   *
   * @param date
   */

  createTimestamp(date: Date = new Date()) {
    return this.admin.firestore.Timestamp.fromDate(date);
  }

  collectionSnapshot(path: string, qb?: QueryBuilder): Promise<QuerySnapshot> {
    const collectionRef: any = this.db.collection(path);

    return (qb ? qb.exec(collectionRef) : collectionRef).get();
  }

  collectionGroupSnapshot(collectionId: string, qb?: QueryBuilder): Promise<QuerySnapshot> {
    const groupRef: any = this.db.collectionGroup(collectionId);

    return (qb ? qb.exec(groupRef) : groupRef).get();
  }

  docRef(path: string): DocumentReference<DocumentData> {
    return this.db.doc(path);
  }
}
