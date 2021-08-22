import type {
  CollectionReference,
  DocumentData,
  FieldPath,
  OrderByDirection,
  Query,
  WhereFilterOp
} from '@firebase/firestore-types';

export class QueryBuilder {
  private _where: [string | FieldPath, WhereFilterOp, any][] = [];
  private _orderBy: [string | FieldPath, OrderByDirection][] = [];
  private _leftJoins: [string, string, string][] = [];
  private _limit?: number;
  private _startAt?: string;
  private _startAfter?: string;
  private _endAt?: string;
  private _endBefore?: string;

  get joins() {
    return this._leftJoins;
  }

  where(field: string | FieldPath, op: WhereFilterOp, value: any) {
    this._where.push([field, op, value]);

    return this;
  }

  orderBy(field: string | FieldPath, od: OrderByDirection) {
    this._orderBy.push([field, od]);

    return this;
  }

  leftJoin(key: string, collection: string, alias: string) {
    this._leftJoins.push([key, collection, alias]);
  }

  limit(limit: number) {
    this._limit = limit;
    return this;
  }

  startAt(startAt: string) {
    this._startAt = startAt;
    return this;
  }

  startAfter(startAfter: string) {
    this._startAfter = startAfter;
    return this;
  }

  endAt(endAt: string) {
    this._endAt = endAt;
    return this;
  }

  endBefore(endBefore: string) {
    this._endBefore = endBefore;
    return this;
  }

  build(ref: CollectionReference<DocumentData> | Query<DocumentData>): Query {
    let query = this._where.reduce((q, wh) => q.where(...wh), ref);
    query = this._orderBy.reduce((q, ob) => q.orderBy(...ob), query);

    if (this._limit) {
      query = query.limit(this._limit);
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
