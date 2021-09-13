import type {
  CollectionReference,
  DocumentData,
  DocumentSnapshot,
  FieldPath,
  OrderByDirection,
  Query,
  WhereFilterOp
} from '@firebase/firestore-types';

type QueryWhere = [fieldPath: string | FieldPath, opStr: WhereFilterOp, value: unknown];
type QueryOrderBy = [fieldPath: string | FieldPath, directionStr?: OrderByDirection];
type QueryLeftJoin = [idField: string, collection: string, alias: string];
type QueryCursor = [snapshot: DocumentSnapshot<unknown>] | unknown[];

declare const window: any;

export class QueryBuilder {
  private _where: QueryWhere[] = [];
  private _orderBy: QueryOrderBy[] = [];
  private _leftJoins: QueryLeftJoin[] = [];
  private _limit?: number;
  private _limitToLast?: number;
  private _startAt?: QueryCursor;
  private _startAfter?: QueryCursor;
  private _endAt?: QueryCursor;
  private _endBefore?: QueryCursor;

  get joins() {
    return this._leftJoins;
  }

  where(...where: QueryWhere) {
    this._where.push(where);

    return this;
  }

  orderBy(...orderBy: QueryOrderBy) {
    this._orderBy.push(orderBy);

    return this;
  }

  leftJoin(...leftJoin: QueryLeftJoin) {
    this._leftJoins.push(leftJoin);
  }

  limit(limit: number) {
    this._limit = limit;
    return this;
  }

  limitToLast(limitToLast: number) {
    this._limitToLast = limitToLast;
    return this;
  }

  startAt(...startAt: QueryCursor) {
    this._startAt = startAt;
    return this;
  }

  startAfter(...startAfter: QueryCursor) {
    this._startAfter = startAfter;
    return this;
  }

  endAt(...endAt: QueryCursor) {
    this._endAt = endAt;
    return this;
  }

  endBefore(...endBefore: QueryCursor) {
    this._endBefore = endBefore;
    return this;
  }

  // Still have to use <any> type due to most interfaces of @google-cloud/firestore
  // are not compatible with @firebase/firestore's interfaces.
  exec(ref: CollectionReference<DocumentData> | any, queryOps?: { [key: string]: any }): Query<DocumentData> | any {
    if (typeof window === 'undefined') {
      return this.execQueryForCloud(ref);
    }

    if (!queryOps) {
      throw Error('invalid arguments');
    }

    const { query, where, orderBy, limit, limitToLast, startAt, startAfter, endAt, endBefore } = queryOps;

    const queryConstraints = [
      ...this._where.map((w) => where(...w)),
      ...this._orderBy.map((o) => orderBy(...o)),
      ...(this._limit ? [limit(this._limit)] : []),
      ...(this._limitToLast ? [limitToLast(this._limitToLast)] : []),
      ...(this._startAt.every((i) => !!i) ? [startAt(...this._startAt)] : []),
      ...(this._startAfter.every((i) => !!i) ? [startAfter(...this._startAfter)] : []),
      ...(this._endAt.every((i) => !!i) ? [endAt(...this._endAt)] : []),
      ...(this._endBefore.every((i) => !!i) ? [endBefore(...this._endBefore)] : [])
    ];

    return query(ref, ...queryConstraints);
  }

  private execQueryForCloud(ref: CollectionReference<DocumentData>): Query<DocumentData> {
    let query = this._where.reduce((q, wh) => q.where(...wh), ref);
    query = this._orderBy.reduce((q, ob) => q.orderBy(...ob), query);

    if (this._limit) {
      query = query.limit(this._limit);
    }

    if (this._limitToLast) {
      query = query.limitToLast(this._limitToLast);
    }

    if (this._startAt) {
      query = query.startAt(this._startAt);
    }

    if (this._startAfter) {
      query = query.startAfter(this._startAfter);
    }

    if (this._endAt) {
      query = query.endAt(this._endAt);
    }

    if (this._endBefore) {
      query = query.endBefore(this._endBefore);
    }

    return query;
  }
}
