import type {
  QuerySnapshot,
  WriteBatch,
  DocumentData,
  SetOptions,
  DocumentReference,
  FirebaseFirestore
} from '@firebase/firestore-types';

import { AbstractFirestoreApi, QueryBuilder } from '../../ngx/db';
import { arrayToChunks } from '../utils';

const CACHE_MAX_AGE = 0;

type Firestore = FirebaseFirestore;

export class FirestoreCloudService extends AbstractFirestoreApi {
  private db: Firestore;
  private admin: any;
  private cache = new Map<string, any>();

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
  async collection<T = any>(collection: string, qb?: QueryBuilder, maxAge = CACHE_MAX_AGE): Promise<T[]> {
    const key = collection + (qb ? JSON.stringify(qb) : '');
    const cached = this.cache.get(key);

    if (maxAge === 0 || !cached || (maxAge && Date.now() - cached.lastRead > maxAge)) {
      const data = (await this.collectionSnapshot(collection, qb)).docs.map(
        (doc) => ({ id: doc.id, ...doc.data() } as any)
      );

      // disable cache in the cloud functions
      if (maxAge !== 0) {
        this.cache.set(key, { lastRead: Date.now(), data });
      }

      return data;
    }

    return cached.data;
  }

  async doc<T = any>(path: string, maxAge = CACHE_MAX_AGE): Promise<T> {
    const cached = this.cache.get(path);

    if (maxAge === 0 || !cached || (maxAge && Date.now() - cached.lastRead > maxAge)) {
      const snapshot = await this.docReference(path).get();
      const data = (snapshot.exists && ({ id: snapshot.id, ...snapshot.data() } as any)) || null;

      return this.cache.set(path, { lastRead: Date.now(), data }) && data;
    }

    return cached.data;
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
    await this.docReference(`${collection}/${id}`).set(Object.assign({}, updata), opts);

    return id;
  }

  async update(path: string, data: { [key: string]: any }) {
    await this.docReference(path).update(data);
  }

  async delete(path: string) {
    await this.docReference(path).delete();
  }

  /**
   * Bulk update data
   */
  async bulkUpsert(collection: string, docs: DocumentData[]) {
    // Due to a batch limitation, need to split docs array into chunks
    for (const chunks of arrayToChunks(docs, this.BATCH_MAX_WRITES)) {
      const batch = this.batch;

      chunks.forEach((doc) => {
        // eslint-disable-next-line prefer-const
        let { id, ...updata } = doc;
        if (!id) {
          id = this.db.collection(collection).doc().id;
        }

        batch.set(this.docReference(`${collection}/${id}`), updata, { merge: true });
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

  get batch(): WriteBatch | any {
    return this.db.batch();
  }

  get serverTimestamp() {
    return this.admin.firestore.FieldValue.serverTimestamp();
  }

  increment(n = 1) {
    return this.admin.firestore.FieldValue.increment(n);
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

    return (qb ? qb.build(collectionRef) : collectionRef).get();
  }

  docReference(path: string): DocumentReference<DocumentData> {
    return this.db.doc(path) as any;
  }
}
