import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

export type CustomGameType = 'promptle' | 'connections' | 'crossword';
export type CustomGameFinalState = 'completed' | 'abandoned';

export interface CustomGameSessionStartPayload {
  playId: string;
  auth0Id: string;
  topic: string;
  gameType: CustomGameType;
}

export interface CustomGameSessionInteractedPayload {
  playId: string;
  auth0Id: string;
}

export interface CustomGameSessionFinalizePayload {
  playId: string;
  auth0Id: string;
  finalState: CustomGameFinalState;
}

@Injectable({
  providedIn: 'root',
})
export class CustomGameSessionService {
  constructor(private http: HttpClient) {}

  startSession(payload: CustomGameSessionStartPayload): Observable<{ success: boolean }> {
    if (!payload.playId || !payload.auth0Id || !payload.topic.trim()) {
      return of({ success: true });
    }

    return this.http.post<{ success: boolean }>('/api/custom-game-session/start', payload);
  }

  markInteracted(payload: CustomGameSessionInteractedPayload): Observable<{ success: boolean }> {
    if (!payload.playId || !payload.auth0Id) {
      return of({ success: true });
    }

    return this.http.post<{ success: boolean }>('/api/custom-game-session/interacted', payload);
  }

  finalizeSession(
    payload: CustomGameSessionFinalizePayload,
    options: { keepalive?: boolean } = {}
  ): Observable<{ success: boolean }> {
    if (!payload.playId || !payload.auth0Id) {
      return of({ success: true });
    }

    if (options.keepalive && typeof window !== 'undefined') {
      const body = JSON.stringify(payload);

      if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
        navigator.sendBeacon(
          '/api/custom-game-session/finalize',
          new Blob([body], { type: 'application/json' })
        );
        return of({ success: true });
      }

      void fetch('/api/custom-game-session/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      });
      return of({ success: true });
    }

    return this.http.post<{ success: boolean }>('/api/custom-game-session/finalize', payload);
  }
}
