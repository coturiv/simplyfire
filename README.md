# simplyfire

A lightweight firestore api for firebase cloud functions & Angular.

![](https://github.com/coturiv/simplyfire/workflows/Build/badge.svg)
[![npm version](https://img.shields.io/npm/v/simplyfire.svg)](https://www.npmjs.com/package/simplyfire)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/59e264bce65b40e2b019edcdee9509f2)](https://www.codacy.com/gh/coturiv/simplyfire/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=coturiv/simplyfire&amp;utm_campaign=Badge_Grade)

## Installation

To use the library, install it via `npm` or `yarn`:

```bash
# To get the latest stable version in dependencies

$ npm install simplyfire --save

# Or

$ yarn add simplyfire
```

### Usage

```

// in the firebase cloud functions

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FirestoreCloudService, QueryBuilder } from 'simplyfire';

const fsService = FirestoreCloudService.getInstance(admin);

export const purgeUnusedUsers = functions.pubsub.schedule('every 24 hours').onRun(async () => {
  const qb = new QueryBuilder();
  qb.where('isEmailVerified', '==', false);
  qb.where('lastSignInTime', '<', new Date(Date.now() - 60 * 24 * 60 * 60 * 1000));

  return fsService.bulkDelete('users', qb);
});


// in the client (with Angular)

import { QueryBuilder } from 'simplyfire';
import { FirebaseService } from 'simplyfire/ngx';

@Injectable({
  providedIn: 'root'
})
export class UserService {

    constructor(private firebaseService: FirebaseService) {}

    async getUsers() {
        const qb = new QueryBuilder();
        qb.where('isEmailVerified', '==', true);
        qb.limit(20);

        qb.leftJoin('companyId', 'companies', 'company');
        qb.leftJoin('lastPostId', 'posts', 'post');

        return await this.firebaseService.collection(`users`, qb);
    }
}

```

### Firestore API

| API | DESCRIPTION |
| ------ | ------ |
| `collection<T>(collection: string, qb?: QueryBuilder, maxAge?: number): Promise<T[]>` |  Get documents from the firestore. |
| `collectionGroup<T>(collectionId: string, qb?: QueryBuilder, maxAge?: number): Promise<T[]>` |  Get documents from the firestore(collectionGroup). |
| `collectionSnapshotChanges<T>(collection: string, qb?: QueryBuilder, events?: DocumentChangeType[]): Observable<T[]>` |  Get documents from the firestore (*Client only*). |
| `collectionValueChanges<T>(collection: string, qb?: QueryBuilder): Observable<T[]>` |  Get documents from the firestore (*Client only*). |
| `doc<T = any>(docPath: string, maxAge?: number): Promise<T>` | Get a document data from the firstore. |
| `docValueChanges<T>(docPath: string): Observable<T>` | Get a document data from the firstore (*Client only*). |
| `upsert(collection: string, data: { id?: string; [key: string]: any }, opts?: SetOptions): Promise<string>` | Insert/or update document. (If data includes `id`, it's an update operation, otherwise inserts a document) |
| `update(docPath: string, data: { [key: string]: any }): Promise<void>` | Update a document. (The `path` must includes document `id`.) |
| `delete(docPath: string): Promise<void>` | Delete a document. |
| `bulkUpsert(collection: string, docs: DocumentData[], opts?: SetOptions): Promise<void>` | Upsert bulk documents. (`batch` writes) |
| `bulkDelete(collection: string, qb?: QueryBuilder): Promise<number>` | Delete bulk documents. (`batch` deletes) |
| `increment(n?: number): FieldValue` | Firestore Increment. |
| `get batch(): WriteBatch` | Getter of Firestore batch. |
| `get serverTimestamp(): FieldValue` | Getter of Firestore timestamp. |
