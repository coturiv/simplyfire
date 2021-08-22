import 'reflect-metadata';

import { ApplicationContext } from '../application-context';

export const Autowire = (): any => {
  return (target: any, propertyKey: string): any => {
    const provider = Reflect.getMetadata('design:type', target, propertyKey);

    type Provider = typeof provider;
    let value: Provider;

    return {
      get: (): Provider => {
        return (value ??= ApplicationContext.injector.get<InstanceType<Provider>>(provider));
      },
      set: (v: Provider) => {
        value = v;
      }
    };
  };
};
