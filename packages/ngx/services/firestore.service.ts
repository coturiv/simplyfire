import { Injectable } from '@angular/core';
import { AngularFirestore } from '@angular/fire/firestore';
import { combineLatest, defer, Observable, of } from 'rxjs';
import { map, switchMap, take } from 'rxjs/operators';

import type { DocumentData, QuerySnapshot, SetOptions } from '@angular/fire/firestore';

import firebase from 'firebase/app';

import { QueryBuilder, AbstractFirestoreApi } from '../db';
import { arrayToChunks } from '../utils';

type DocumentChangeType = firebase.firestore.DocumentChangeType;

const CACHE_MAX_AGE = 5 * 60 * 1000;

@Injectable({
  providedIn: 'root'
})
export class FirestoreService extends AbstractFirestoreApi {
  private cache = new Map<string, any>();

  constructor(private afs: AngularFirestore) {
    super();
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Abstract members
  // -----------------------------------------------------------------------------------------------------

  collection<T = any>(path: string, qb?: QueryBuilder, maxAge = CACHE_MAX_AGE): Promise<T[]> {
    return this.collectionWithCache(path, qb, maxAge).pipe(take(1)).toPromise();
  }

  doc<T>(path: string, maxAge = CACHE_MAX_AGE): Promise<T> {
    return this.docWithCache(path, maxAge).pipe(take(1)).toPromise();
  }

  async upsert(collection: string, data: { [key: string]: any }, opts?: SetOptions): Promise<string> {
    const timestamp = this.serverTimestamp;

    let { id, ...updata } = data;
    if (!id) {
      id = this.afs.createId();
      updata.createdTs = timestamp;
    }

    updata.updatedTs = timestamp;
    await this.afs.doc(`${collection}/${id}`).set(Object.assign({}, updata), opts);

    return id;
  }

  update(path: string, data: { [key: string]: any }) {
    const updatedTs = this.serverTimestamp;

    // ignore id
    delete data['id'];

    return this.afs.doc(path).update(Object.assign({}, data, { updatedTs }));
  }

  delete(path: string) {
    return this.afs.doc(path).delete();
  }

  async bulkUpsert(collection: string, docs: DocumentData[], opts?: SetOptions): Promise<void> {
    // Due to a batch limitation, need to split docs array into chunks
    for (const chunks of arrayToChunks(docs, this.BATCH_MAX_WRITES)) {
      const batch = this.batch;

      chunks.forEach((doc) => {
        let { id, ...updata } = doc;
        if (!id) {
          id = this.afs.createId();
        }

        batch.set(this.afs.doc(`${collection}/${id}`).ref, updata, opts);
      });
      await batch.commit();
    }
  }

  async bulkDelete(collection: string, qb?: QueryBuilder, maxSize = 1000): Promise<number> {
    if (!qb) {
      qb = new QueryBuilder();
      qb.limit(maxSize);
    }

    let totalCount = 0;
    const snapshot: QuerySnapshot<DocumentData> = await qb.build(this.afs.collection(collection).ref).get();

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
    return this.afs.firestore.batch();
  }

  /**
   * firestore timestamp
   */
  get serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  /**
   * FieldValue increment
   */
  increment(n = 1) {
    return firebase.firestore.FieldValue.increment(n);
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Custom methods
  // -----------------------------------------------------------------------------------------------------

  collectionValueChanges<T = any>(path: string, qb?: QueryBuilder): Observable<T[]> {
    return this.afs
      .collection(path, (ref) => (qb ? qb.build(ref) : ref))
      .valueChanges({ idField: 'id' })
      .pipe((s) => (qb?.joins ?? []).map((j) => leftJoin(this, ...j)).reduce((ss, o) => o(ss), s));
  }

  collectionSnapshotChanges<T = any>(path: string, qb?: QueryBuilder, events?: DocumentChangeType[]): Observable<T[]> {
    return this.afs
      .collection(path, (ref) => (qb ? qb.build(ref) : ref))
      .snapshotChanges(events)
      .pipe(
        map((changes) => changes.map((c) => Object.assign({}, c.payload.doc.data(), { id: c.payload.doc.id } as any))),
        (s) => (qb?.joins ?? []).map((j) => leftJoin(this, ...j)).reduce((ss, o) => o(ss), s)
      );
  }

  docValueChanges<T>(path: string): Observable<T> {
    return this.afs.doc(path).valueChanges({ idField: 'id' }) as Observable<any>;
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
