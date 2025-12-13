//Richard Nguyen created this service for Auth0 login
import { Injectable } from '@angular/core';
import { AuthService as Auth0Service, User } from '@auth0/auth0-angular';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {

  constructor(private auth0: Auth0Service) {}

  login() {
    this.auth0.loginWithRedirect();
  }

  logout() {
    this.auth0.logout({
      logoutParams: {
        returnTo: window.location.origin
      }
    });
  }

  get isAuthenticated$(): Observable<boolean> {
    return this.auth0.isAuthenticated$;
  }

  get user$(): Observable<User | null | undefined> {
    return this.auth0.user$;
  }
}