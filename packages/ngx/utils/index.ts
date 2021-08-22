import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export * from './arrays';

// flatten the array of observables to one level deep
export const flatten = (source: Observable<any[]>) => {
  return source.pipe(map((arr) => arr.reduce((acc: any[], cur: any[]) => acc.concat(cur))));
};
