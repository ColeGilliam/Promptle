import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export type SharedGameType = 'promptle' | 'connections' | 'crossword';

export interface CreateSharedGameResponse {
  shareCode: string;
  gameType: SharedGameType;
  expiresAt: string;
}

export interface LoadSharedGameResponse<TPayload> {
  shareCode: string;
  gameType: SharedGameType;
  expiresAt: string;
  createdAt: string | null;
  payload: TPayload;
}

@Injectable({
  providedIn: 'root',
})
export class SharedGameService {
  private readonly apiBaseUrl = '/api/shared-games';

  constructor(private http: HttpClient) {}

  createSharedGame<TPayload extends object>(
    gameType: SharedGameType,
    payload: TPayload,
    auth0Id: string
  ): Observable<CreateSharedGameResponse> {
    return this.http.post<CreateSharedGameResponse>(this.apiBaseUrl, {
      auth0Id,
      gameType,
      payload,
    });
  }

  loadSharedGame<TPayload>(
    shareCode: string,
    expectedGameType: SharedGameType
  ): Observable<LoadSharedGameResponse<TPayload>> {
    return this.http.get<LoadSharedGameResponse<TPayload>>(
      `${this.apiBaseUrl}/${encodeURIComponent(shareCode)}?gameType=${encodeURIComponent(expectedGameType)}`
    );
  }

  buildSharedGameUrl(gameType: SharedGameType, shareCode: string): string {
    return `${window.location.origin}${this.getGamePath(gameType)}?share=${encodeURIComponent(shareCode)}`;
  }

  private getGamePath(gameType: SharedGameType): string {
    switch (gameType) {
      case 'promptle':
        return '/game';
      case 'connections':
        return '/connections';
      case 'crossword':
        return '/crossword';
    }
  }
}
