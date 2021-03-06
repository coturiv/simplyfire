import type {
  QuerySnapshot,
  WriteBatch,
  DocumentData,
  SetOptions,
  DocumentReference,
  FirebaseFirestore,
  Transaction,
  CollectionReference,
  Settings as FirestoreSettings
} from '@firebase/firestore-types';

import { AbstractFirestoreApi, QueryBuilder } from '../../ngx/db';
import { arrayToChunks } from '../utils';

type Firestore = FirebaseFirestore;

export class FirestoreCloudService extends AbstractFirestoreApi {
  private db: Firestore;
  private admin: any;

  private static instance: FirestoreCloudService = null;

  static getInstance(admin: any, settings: FirestoreSettings = {}) {
    this.instance ??= new this();
    this.instance.initialize(admin, settings);

    return this.instance;
  }

  initialize(admin: any, settings: FirestoreSettings) {
    admin.initializeApp();

    this.db = admin.firestore() as Firestore;
    this.db.settings(settings);
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
    updata.createdTs ??= timestamp;

    if (!id) {
      id = this.db.collection(collection).doc().id;
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
  async bulkUpsert(
    path: string,
    data: DocumentData[] | { data: DocumentData; qb?: QueryBuilder },
    opts: SetOptions = { merge: true }
  ): Promise<string[]> {
    const bulkIds = [];
    const promises = [];

    const timestamp = this.serverTimestamp;

    if (Array.isArray(data)) {
      // Due to a batch limitation, need to split docs array into chunks
      for (const chunks of arrayToChunks(data, this.BATCH_MAX_WRITES)) {
        const batch = this.batch;

        chunks.forEach((d) => {
          let { id, ...updata } = d;
          id ??= this.db.collection(path).doc().id;
          updata.createdTs ??= timestamp;
          updata.updatedTs = timestamp;

          batch.set(this.docRef(`${path}/${id}`), updata, opts);
          bulkIds.push(id);
        });
        const p = batch.commit();
        promises.push(p);
      }
    } else {
      const snapshot = await this.collectionSnapshot(path, data.qb);
      // Due to a batch limitation, need to split docs array into chunks
      for (const chunks of arrayToChunks(snapshot.docs, this.BATCH_MAX_WRITES)) {
        const batch = this.batch;

        chunks.forEach((d) => batch.set(d.ref, { updatedTs: timestamp, ...data.data }, opts) && bulkIds.push(d.id));

        const p = batch.commit();
        promises.push(p);
      }
    }

    await Promise.all(promises);

    return bulkIds;
  }

  /**
   * Bulk delete data
   */
  async bulkDelete(collection: string, qb?: QueryBuilder, maxSize = 1000) {
    if (!qb) {
      qb = new QueryBuilder();
      qb.limit(maxSize);
    }

    const bulkIds = [];
    const promises = [];
    const snapshot: QuerySnapshot = await this.collectionSnapshot(collection, qb);

    // Due to a batch limitation, need to split docs array into chunks
    for (const chunks of arrayToChunks(snapshot.docs, this.BATCH_MAX_WRITES)) {
      const batch = this.batch;

      chunks.forEach((doc) => batch.delete(doc.ref) && bulkIds.push(doc.id));
      const p = batch.commit();
      promises.push(p);
    }

    await Promise.all(promises);

    return bulkIds;
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

  /**
   * Returns a generated Firestore Document Id.
   */
  createId(colPath?: string) {
    return this.db.collection(colPath ?? '_').doc().id;
  }

  runTransaction(updateFunction: (transaction: Transaction) => Promise<unknown>): Promise<unknown> {
    return this.db.runTransaction(updateFunction);
  }

  // Recursively delete a reference and log the references of failures.
  // https://github.com/googleapis/nodejs-firestore/pull/1494
  recursiveDelete(ref: CollectionReference<unknown> | DocumentReference<unknown>, bulkWriter?: any) {
    return (this.db as any).recursiveDelete(ref, bulkWriter);
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
