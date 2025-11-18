import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';

import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { AuthModule } from '@auth0/auth0-angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideHttpClient(),
    provideRouter(routes),
    importProvidersFrom(
      AuthModule.forRoot({
        domain: 'dev-k7ccyuzmbitffkjn.us.auth0.com',            
        clientId: 'yHMQi4MXHK0ZSpBZPUNo2SIsmc2rDYsd',      
        authorizationParams: {
          redirect_uri: window.location.origin,
        }
      }))
  ]
};
