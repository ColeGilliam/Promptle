import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of, throwError } from 'rxjs';

export type FeedbackGameType = 'promptle' | 'connections' | 'crossword';
export type FeedbackGameResult = 'won' | 'revealed';

export interface GameFeedbackPayload {
  auth0Id?: string;
  topic: string;
  liked: boolean;
  gameType: FeedbackGameType;
  result?: FeedbackGameResult;
}

@Injectable({
  providedIn: 'root',
})
export class GameFeedbackService {
  constructor(private http: HttpClient) {}

  submitFeedback(payload: GameFeedbackPayload): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>('/api/game-feedback', payload).pipe(
      // Feedback is not necessary, so server/network failures don't interrupt the UI or prompt the player to retry.
      catchError((error: HttpErrorResponse) => {
        if (error.status === 0 || error.status >= 500) {
          return of({ success: true });
        }

        return throwError(() => error);
      })
    );
  }
}
