import { Injectable } from '@angular/core';
import { AuthService as Auth0Service, User } from '@auth0/auth0-angular';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

type DevAuthSessionResponse = {
  enabled: boolean;
  user?: User;
};

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {
  private apiUrl = '/api';
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);
  private userSubject = new BehaviorSubject<User | null | undefined>(undefined);
  private devBypassEnabled = false;
  public mongoUser$ = new BehaviorSubject<any>(null);

  constructor(
    private auth0: Auth0Service,
    private http: HttpClient
  ) {
    this.initializeAuthState();
  }

  // Check if DEV_AUTH is enabled and set authentication state accordingly
  private initializeAuthState() {
    this.http.get<DevAuthSessionResponse>(`${this.apiUrl}/dev-auth/session`).subscribe({
      next: (session) => {
        if (session.enabled && session.user?.sub) {
          this.devBypassEnabled = true;
          this.isAuthenticatedSubject.next(true);
          this.userSubject.next(session.user);
          return;
        }

        this.bindAuth0State();
      },
      error: () => {
        this.bindAuth0State();
      }
    });
  }

  private bindAuth0State() {
    this.auth0.isAuthenticated$.subscribe(status => this.isAuthenticatedSubject.next(status));
    this.auth0.user$.subscribe(user => this.userSubject.next(user));
  }

  login() {
    if (this.devBypassEnabled) {
      console.info('DEV_AUTH is enabled; login() is bypassed locally.');
      return;
    }

    this.auth0.loginWithRedirect();
  }

  logout() {
    if (this.devBypassEnabled) {
      console.info('DEV_AUTH is enabled; logout() is bypassed locally.');
      return;
    }

    this.auth0.logout({
      logoutParams: {
        returnTo: window.location.origin
      }
    });
  }

  deleteAccount(auth0Id: string): void {
    const encodedId = encodeURIComponent(auth0Id); // Safely handles the "|" character
    this.http.delete(`${this.apiUrl}/delete-account/${encodedId}`).subscribe({
      next: () => {
        console.log('Account deleted from database and Auth0');
        this.logout(); // Log out the user after successful deletion
      },
      error: (err) => {
        console.error('Error deleting account:', err);
        alert('Could not delete account. Please try again later.');
      }
    });
  }

  get isAuthenticated$(): Observable<boolean> {
    return this.isAuthenticatedSubject.asObservable();
  }

  get user$(): Observable<User | null | undefined> {
    return this.userSubject.asObservable();
  }

  setMongoUser(data: any) {
    this.mongoUser$.next(data);
  }
}
