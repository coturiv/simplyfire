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
  runTransaction
} from '@angular/fire/firestore';
import type {
  Firestore,
  DocumentChangeType,
  DocumentData,
  QuerySnapshot,
  SetOptions,
  Transaction
} from '@angular/fire/firestore';

import { combineLatest, defer, Observable, of } from 'rxjs';
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
  firestore: Firestore;

  private cache = new Map<string, any>();

  constructor() {
    super();

    this.firestore = getFirestore();
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Abstract members
  // -----------------------------------------------------------------------------------------------------

  collection<T = any>(path: string, qb?: QueryBuilder, maxAge = CACHE_MAX_AGE): Promise<T[]> {
    return this.collectionWithCache(path, qb, maxAge).pipe(take(1)).toPromise();
  }

  collectionGroup<T = any>(collectionId: string, qb?: QueryBuilder, maxAge = CACHE_MAX_AGE): Promise<T[]> {
    return this.collectionGroupWithCache(collectionId, qb, maxAge).pipe(take(1)).toPromise();
  }

  doc<T = any>(path: string, maxAge = CACHE_MAX_AGE): Promise<T> {
    return this.docWithCache(path, maxAge).pipe(take(1)).toPromise();
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
    updata.updatedTs = timestamp;

    if (id) {
      await setDoc(doc(this.firestore, `${collectionPath}/${id}`), Object.assign({}, updata), opts);
    } else {
      updata.createdTs = timestamp;
      id = (await addDoc(collection(this.firestore, collectionPath), updata)).id;
    }

    return id;
  }

  update(docPath: string, data: { [key: string]: any }) {
    const docRef = doc(this.firestore, docPath);
    const updatedTs = this.serverTimestamp;

    // ignore id
    delete data['id'];

    return updateDoc(docRef, Object.assign({}, data, { updatedTs }));
  }

  delete(docPath: string) {
    const docRef = doc(this.firestore, docPath);
    return deleteDoc(docRef);
  }

  async bulkUpsert(collectionPath: string, docs: DocumentData[], opts: SetOptions = { merge: true }): Promise<void> {
    // Due to a batch limitation, need to split docs array into chunks
    for (const chunks of arrayToChunks(docs, this.BATCH_MAX_WRITES)) {
      const batch = this.batch;
      const timestamp = this.serverTimestamp;

      chunks.forEach(async (doc) => {
        let { id, ...updata } = doc;
        updata.updatedTs = timestamp;

        let docRef: any;

        if (id) {
          docRef = doc(this.firestore, `${collectionPath}/${id}`);
        } else {
          updata.createdTs = timestamp;
          docRef = doc(collection(this.firestore, collectionPath));
        }

        batch.set(docRef, updata, opts);
      });
      await batch.commit();
    }
  }

  async bulkDelete(path: string, qb?: QueryBuilder, maxSize = 1000): Promise<number> {
    qb ??= new QueryBuilder();
    qb.limit(maxSize);

    let totalCount = 0;
    const collectionRef = collection(this.firestore, path);
    const snapshot: QuerySnapshot<DocumentData> = await getDocs(qb.exec(collectionRef, queryOps));

    // Due to a batch limitation, need to split docs array into chunks
    for (const chunks of arrayToChunks(snapshot.docs, this.BATCH_MAX_WRITES)) {
      const batch = this.batch;

      chunks.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();

      totalCount += chunks.length;
    }

    return totalCount;
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

          if (Array.isArray(data)) {
            const docs$ = (ret as any[]).filter((i) => i[key]).map((i) => fs.docWithCache(`${collection}/${i[key]}`));

            return docs$.length ? combineLatest(docs$) : of([]);
          }

          return data && data[key] ? fs.docWithCache(`${collection}/${data[key]}`, maxAge) : of(null);
        }),
        map((joins) => {
          if (Array.isArray(ret)) {
            return ret.map((i) => {
              if (i[key]) {
                i[alias] = joins.filter((j) => j?.id === i[key])[0];
              }

              return i;
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
