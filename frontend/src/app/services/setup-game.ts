// services/db-game.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';

// Define the normalized game data structure
export interface GameData {
  topic: string;
  headers: string[];
  answers: { name: string; values: string[] }[];
  correctAnswer: { name: string; values: string[] };
  mode?: string;
}

@Injectable({ providedIn: 'root' })
export class DbGameService {
  private readonly apiBaseUrl = '/api';

  constructor(private http: HttpClient) {}

  // Database-backed game fetch (numeric topicId, optional answer seed)
  fetchGameByTopic(topicId: number, answer?: string): Observable<GameData> {
    const answerParam = answer ? `&answer=${encodeURIComponent(answer)}` : '';
    return this.http.get<GameData>(
      `${this.apiBaseUrl}/game/start?topicId=${topicId}${answerParam}`
    );
  }

  // AI game generation (string topic) — dev account only
  generateAiGame(topic: string, auth0Id: string, options?: { minCategories?: number; maxCategories?: number }): Observable<GameData> {
    const body: any = { topic: topic.trim(), auth0Id };
    if (options?.minCategories !== undefined) body.minCategories = options.minCategories;
    if (options?.maxCategories !== undefined) body.maxCategories = options.maxCategories;

    return this.http.post<GameData>(`${this.apiBaseUrl}/subjects`, body);
  }

  // Multiplayer game fetch (string room code)
  fetchGameByRoom(room: string): Observable<GameData> {
    return this.http.get<GameData>(
      `${this.apiBaseUrl}/game/start?room=${encodeURIComponent(room)}`
    );
  }

  /**
   * Unified entry point for fetching a game.
   * - topic (string) → AI generation (/subjects)
   * - topicId (number) → DB topic (/game/start?topicId=...)
   * - room (string) → multiplayer saved game (/game/start?room=...)
   */
  fetchGame(params: {
    topic?: string;
    topicId?: number;
    room?: string;
    answer?: string;
    auth0Id?: string;
  }): Observable<GameData> {
    if (params.topic && params.topic.trim()) {
      return this.generateAiGame(params.topic.trim(), params.auth0Id || '');
    }

    if (params.room && params.room.trim()) {
      return this.fetchGameByRoom(params.room.trim());
    }

    if (params.topicId !== undefined && Number.isFinite(params.topicId)) {
      return this.fetchGameByTopic(params.topicId, params.answer);
    }

    return throwError(() => new Error('Missing valid topic, topicId, or room'));
  }
}