import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private apiUrl = 'http://localhost:3001/api';

  constructor(private http: HttpClient) {}

  // Get profile from Mongo
  getProfile(auth0Id: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/profile/${auth0Id}`);
  }

  // Update profile in Mongo
  updateProfile(payload: {auth0Id: string, username: string, profilePic: string}): Observable<any> {
    return this.http.put(`${this.apiUrl}/update-profile`, payload);
  }
}