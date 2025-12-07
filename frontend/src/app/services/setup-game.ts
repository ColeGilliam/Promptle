// services/db-game.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Define the normalized game data structure
export interface GameData {
  topic: string;
  headers: string[];
  answers: { name: string; values: string[] }[];
  correctAnswer: {name: string; values: string[]};
}

@Injectable({ providedIn: 'root' })
export class DbGameService {
  private readonly apiBaseUrl = 'http://localhost:3001/api';

  constructor(private http: HttpClient) {}

  fetchGameByTopic(topicId: number): Observable<GameData> {
    return this.http.get<GameData>(
      `${this.apiBaseUrl}/game/start?topicId=${topicId}`
    );
  }

}
