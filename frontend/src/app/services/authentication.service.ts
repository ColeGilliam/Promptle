import { Injectable } from '@angular/core';
import { AuthService as Auth0Service, User } from '@auth0/auth0-angular';
import { Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';

@Injectable({
  providedIn: 'root'
})
export class AuthenticationService {

  private apiUrl = 'http://localhost:3001/api'; 

  constructor(
    private auth0: Auth0Service,
    private http: HttpClient
  ) {}

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
    return this.auth0.isAuthenticated$;
  }

  get user$(): Observable<User | null | undefined> {
    return this.auth0.user$;
  }
}