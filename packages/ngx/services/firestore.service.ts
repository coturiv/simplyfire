import { Injectable } from '@angular/core';
import {
  getFirestore,
  doc,
  docData,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  collectionData,
  collectionGroup,
  collectionChanges,
  getDocs,
  increment,
  writeBatch,
  serverTimestamp,
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  startAt,
  startAfter,
  endAt,
  endBefore,
  runTransaction,
  documentId
} from '@angular/fire/firestore';
import type {
  Firestore,
  DocumentChangeType,
  DocumentData,
  QuerySnapshot,
  SetOptions,
  Transaction
} from '@angular/fire/firestore';

import { combineLatest, defer, lastValueFrom, Observable, of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

import { QueryBuilder, AbstractFirestoreApi } from '../db';
import { arrayToChunks } from '../utils';

const queryOps = {
  query,
  where,
  orderBy,
  limit,
  limitToLast,
  startAt,
  startAfter,
  endAt,
  endBefore
};

const CACHE_MAX_AGE = 5 * 60 * 1000;

@Injectable({
  providedIn: 'root'
})
export class FirestoreService extends AbstractFirestoreApi {
  get firestore(): Firestore {
    return getFirestore();
  }

  private cache = new Map<string, any>();

  // -----------------------------------------------------------------------------------------------------
  // @ Abstract members
  // -----------------------------------------------------------------------------------------------------

  collection<T = any>(path: string, qb?: QueryBuilder, maxAge = CACHE_MAX_AGE): Promise<T[]> {
    return lastValueFrom(this.collectionWithCache(path, qb, maxAge).pipe(take(1)));
  }

  collectionGroup<T = any>(collectionId: string, qb?: QueryBuilder, maxAge = CACHE_MAX_AGE): Promise<T[]> {
    return lastValueFrom(this.collectionGroupWithCache(collectionId, qb, maxAge).pipe(take(1)));
  }

  doc<T = any>(path: string, maxAge = CACHE_MAX_AGE): Promise<T> {
    return lastValueFrom(this.docWithCache(path, maxAge).pipe(take(1)));
  }

  docRef(path: string) {
    return doc(this.firestore, path) as any;
  }

  async upsert(
    collectionPath: string,
    data: { [key: string]: any },
    opts: SetOptions = { merge: true }
  ): Promise<string> {
    const timestamp = this.serverTimestamp;

    let { id, ...updata } = data;
    updata.createdTs ??= timestamp;
    updata.updatedTs = timestamp;

    if (id) {
      await setDoc(this.docRef(`${collectionPath}/${id}`), Object.assign({}, updata), opts);
    } else {
      id = (await addDoc(collection(this.firestore, collectionPath), updata)).id;
    }

    return id;
  }

  update(docPath: string, data: { [key: string]: any }) {
    const updatedTs = this.serverTimestamp;

    // ignore id
    delete data['id'];

    return updateDoc(this.docRef(docPath), Object.assign({}, data, { updatedTs }));
  }

  delete(docPath: string) {
    return deleteDoc(this.docRef(docPath));
  }

  async bulkUpsert(
    path: string,
    data: DocumentData[] | { data: DocumentData; qb?: QueryBuilder },
    opts: SetOptions = { merge: true }
  ): Promise<string[]> {
    const bulkIds = [];
    const promises = [];

    if (Array.isArray(data)) {
      // Due to a batch limitation, need to split docs array into chunks
      for (const chunks of arrayToChunks(data, this.BATCH_MAX_WRITES)) {
        const batch = this.batch;
        const timestamp = this.serverTimestamp;

        chunks.forEach(async ({ id, ...updata }) => {
          updata.createdTs ??= timestamp;
          updata.updatedTs = timestamp;

          let docRef: any;

          if (id) {
            docRef = this.docRef(`${path}/${id}`);
          } else {
            docRef = doc(collection(this.firestore, path));
          }

          bulkIds.push(docRef.id);
          batch.set(docRef, updata, opts);
        });

        const p = batch.commit();
        promises.push(p);
      }
    } else {
      const snapshot = await this.collectionSnapshot(path, data.qb);

      // Due to a batch limitation, need to split docs array into chunks
      for (const chunks of arrayToChunks(snapshot.docs, this.BATCH_MAX_WRITES)) {
        const batch = this.batch;
        const timestamp = this.serverTimestamp;

        chunks.forEach((d) => batch.set(d.ref, { updatedTs: timestamp, ...data.data }, opts) && bulkIds.push(d.id));

        const p = batch.commit();
        promises.push(p);
      }
    }

    await Promise.all(promises);

    return bulkIds;
  }

  async bulkDelete(path: string, qb?: QueryBuilder, maxSize = 1000): Promise<string[]> {
    qb ??= new QueryBuilder();
    qb.limit(maxSize);

    const bulkIds = [];
    const promises = [];

    const snapshot: QuerySnapshot<DocumentData> = await this.collectionSnapshot(path, qb);

    // Due to a batch limitation, need to split docs array into chunks
    for (const chunks of arrayToChunks(snapshot.docs, this.BATCH_MAX_WRITES)) {
      const batch = this.batch;

      chunks.forEach((d) => batch.delete(d.ref) && bulkIds.push(d.id));
      const p = batch.commit();
      promises.push(p);
    }

    await Promise.all(promises);

    return bulkIds;
  }

  /**
   * write batch
   */
  get batch() {
    return writeBatch(this.firestore) as any;
  }

  /**
   * firestore timestamp
   */
  get serverTimestamp() {
    return serverTimestamp();
  }

  /**
   * FieldValue increment
   */
  increment(n = 1) {
    return increment(n);
  }

  /**
   * Returns a generated Firestore Document Id.
   */
  createId(colPath?: string) {
    return doc(collection(this.firestore, colPath ?? '_')).id;
  }

  runTransaction(updateFunction: (transaction: Transaction | any) => Promise<unknown>): Promise<unknown> {
    return runTransaction(this.firestore, updateFunction);
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Custom methods
  // -----------------------------------------------------------------------------------------------------

  collectionValueChanges<T = any>(path: string, qb?: QueryBuilder): Observable<T[]> {
    const collectionRef = collection(this.firestore, path);
    qb ??= new QueryBuilder();

    return collectionData(qb.exec(collectionRef, queryOps), { idField: 'id' }).pipe((s) =>
      (qb?.joins ?? []).map((j) => leftJoin(this, ...j)).reduce((ss, o) => o(ss), s)
    );
  }

  collectionGroupValueChanges<T = any>(collectionId: string, qb?: QueryBuilder): Observable<T[]> {
    const collectionRef = collectionGroup(this.firestore, collectionId);
    qb ??= new QueryBuilder();

    return collectionData(qb.exec(collectionRef, queryOps), { idField: 'id' }).pipe((s) =>
      (qb?.joins ?? []).map((j) => leftJoin(this, ...j)).reduce((ss, o) => o(ss), s)
    );
  }

  collectionSnapshot(path: string, qb?: QueryBuilder): Promise<QuerySnapshot<any> | any> {
    qb ??= new QueryBuilder();

    const collectionRef = collection(this.firestore, path);
    return getDocs(qb.exec(collectionRef, queryOps));
  }

  collectionSnapshotChanges<T = any>(path: string, qb?: QueryBuilder, events?: DocumentChangeType[]): Observable<T[]> {
    const collectionRef: any = collection(this.firestore, path);
    qb ??= new QueryBuilder();

    return collectionChanges(qb.exec(collectionRef, queryOps), { events }).pipe(
      map((changes) => changes.map((c) => Object.assign({}, c.doc.data(), { id: c.doc.id } as any))),
      (s) => (qb?.joins ?? []).map((j) => leftJoin(this, ...j)).reduce((ss, o) => o(ss), s)
    );
  }

  collectionGroupSnapshotChanges<T = any>(
    collectionId: string,
    qb?: QueryBuilder,
    events?: DocumentChangeType[]
  ): Observable<T[]> {
    const collectionRef: any = collectionGroup(this.firestore, collectionId);
    qb ??= new QueryBuilder();

    return collectionChanges(qb.exec(collectionRef, queryOps), { events }).pipe(
      map((changes) => changes.map((c) => Object.assign({}, c.doc.data(), { id: c.doc.id } as any))),
      (s) => (qb?.joins ?? []).map((j) => leftJoin(this, ...j)).reduce((ss, o) => o(ss), s)
    );
  }

  docValueChanges<T = any>(path: string): Observable<T> {
    const docRef: any = doc(this.firestore, path);
    return docData<T>(docRef, { idField: 'id' });
  }

  /**
   * @experimental
   *
   * Cache collection data in memory
   */
  collectionWithCache<T = any>(path: string, qb?: QueryBuilder, maxAge?: number): Observable<T[]> {
    return this.fetchFromCache(path + (qb ? JSON.stringify(qb) : ''), this.collectionValueChanges<T>(path, qb), maxAge);
  }

  /**
   * @experimental
   *
   * Cache collectionGroup data in memory
   */
  collectionGroupWithCache<T = any>(collectionId: string, qb?: QueryBuilder, maxAge?: number): Observable<T[]> {
    return this.fetchFromCache(
      collectionId + (qb ? JSON.stringify(qb) : ''),
      this.collectionGroupValueChanges<T>(collectionId, qb),
      maxAge
    );
  }

  /**
   * @experimental
   *
   * Cache document data in memory
   */
  docWithCache(path: string, maxAge?: number) {
    return this.fetchFromCache(path, this.docValueChanges(path), maxAge);
  }

  /**
   * @experimental
   *
   * Delete cached data from the memory
   */
  deleteCache(path: string, qb?: QueryBuilder) {
    const key = path + (qb ? JSON.stringify(qb) : '');
    return this.cache.delete(key);
  }

  private fetchFromCache(key: string, source: Observable<any>, maxAge: number) {
    const cached = this.cache.get(key);

    if (maxAge === 0 || !cached || (maxAge && Date.now() - cached.lastRead > maxAge)) {
      return source.pipe(map((data) => this.cache.set(key, { lastRead: Date.now(), data }) && data));
    }

    return of(cached.data);
  }
}

const leftJoin = (fs: FirestoreService, key: string, collection: string, alias: string, maxAge?: number) => {
  if (key === alias) {
    throw Error('Due to use of Cache, you must use different alias for a key.');
  }

  return (source: Observable<any | any[]>) =>
    defer(() => {
      let ret: any;

      return source.pipe(
        switchMap((data) => {
          ret = data;

          const fetchJoinData = (id: string | string[]) => {
            if (Array.isArray(id)) {
              const qb = new QueryBuilder();
              qb.where(documentId(), 'in', id);
              return fs.collectionWithCache(collection, qb, maxAge);
            }

            return fs.docWithCache(`${collection}/${id}`, maxAge);
          };

          if (Array.isArray(data)) {
            const docs$ = (ret as any[]).filter((i) => i[key]).map((i) => fetchJoinData(i[key]));
            return docs$.length ? combineLatest(docs$) : of([]);
          }

          return data && data[key] ? fetchJoinData(data[key]) : of(null);
        }),
        map((joins) => {
          if (Array.isArray(ret)) {
            return ret.map((r) => {
              const id = r[key];
              if (id) {
                if (Array.isArray(id)) {
                  r[alias] = joins
                    .filter(
                      (j: any) =>
                        Array.isArray(j) && JSON.stringify(j.map((jj) => jj.id).sort()) === JSON.stringify(id.sort())
                    )
                    .pop();
                } else {
                  r[alias] = joins.filter((j: any) => j?.id === id).pop();
                }
              }

              return r;
            });
          }

          if (ret) {
            ret[alias] = joins;
          }

          return ret;
        })
      );
    });
};
