import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';

export interface RecommendationItem {
  type: 'custom' | 'popular';
  topic: string;
  topicId?: number;
  reason: 'liked_topic' | 'completed_topic' | 'popular_fallback' | 'trending_custom';
}

@Injectable({
  providedIn: 'root',
})
export class RecommendationsService {
  constructor(private http: HttpClient) {}

  getRecommendations(auth0Id: string): Observable<{ items: RecommendationItem[] }> {
    const normalizedAuth0Id = auth0Id.trim();
    if (!normalizedAuth0Id) {
      return of({ items: [] });
    }

    return this.http.get<{ items: RecommendationItem[] }>(
      `/api/recommendations/${encodeURIComponent(normalizedAuth0Id)}`
    );
  }
}
