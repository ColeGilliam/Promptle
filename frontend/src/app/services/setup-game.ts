//Cole Gilliam implemented a chunk of this service off of a depreciated service

// services/db-game.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

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

  // Database-backed game fetch
  fetchGameByTopic(topicId: number): Observable<GameData> {
    return this.http.get<GameData>(
      `${this.apiBaseUrl}/game/start?topicId=${topicId}`
    );
  }

  // AI game generation
  generateAiGame(topic: string, options?: { minCategories?: number; maxCategories?: number }): Observable<GameData> {
    const body: any = { topic };
    if (options?.minCategories !== undefined) body.minCategories = options.minCategories;
    if (options?.maxCategories !== undefined) body.maxCategories = options.maxCategories;

    return this.http.post<GameData>(`${this.apiBaseUrl}/subjects`, body);
  }


  fetchGame(params: { topic?: string; topicId?: number }): Observable<GameData> {
    if (params.topic && params.topic.trim()) {
      return this.generateAiGame(params.topic.trim());
    }

    if (Number.isFinite(params.topicId)) {
      return this.fetchGameByTopic(Number(params.topicId));
    }

    return throwError(() => new Error('Missing topic or topicId'));
  }
  
}
