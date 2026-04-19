import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type ConnectionsDifficulty = 'yellow' | 'green' | 'blue' | 'purple';

// Frontend contract for the validated puzzle payload returned by the backend.
export interface ConnectionsGroup {
  category: string;
  difficulty: ConnectionsDifficulty;
  words: string[];
  explanation?: string;
}

export interface ConnectionsGameData {
  topic: string;
  groups: ConnectionsGroup[];
}

@Injectable({
  providedIn: 'root',
})
export class ConnectionsGameService {
  constructor(private http: HttpClient) {}

  generateGame(topic: string, auth0Id = ''): Observable<ConnectionsGameData> {
    // Thin wrapper so the component only deals with typed puzzle data, not raw HTTP details.
    return this.http.post<ConnectionsGameData>('/api/connections', {
      topic,
      auth0Id,
    });
  }
}
