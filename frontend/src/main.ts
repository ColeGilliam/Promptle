import { bootstrapApplication } from '@angular/platform-browser';
import { isDevMode } from '@angular/core';
import { appConfig } from './app/app.config';
import { App } from './app/app';

if (!isDevMode()) {
  console.log = () => {};
  console.debug = () => {};
  console.info = () => {};
}

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
