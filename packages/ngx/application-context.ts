import { Injectable, Injector } from '@angular/core';

type ApplicationOptions = { [key: string]: any };

@Injectable({
  providedIn: 'root'
})
export class ApplicationContext {
  static injector: Injector = null;

  private options: ApplicationOptions;

  private static instance: ApplicationContext = null;

  static getInstance(options?: ApplicationOptions) {
    this.instance ??= new this();
    this.instance.initialize(options);
  }

  initialize(options?: ApplicationOptions) {
    this.options = options;
  }
}
