import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class TopicsListService {
  private baseUrl = 'http://localhost:3001/api';

  constructor(private http: HttpClient) {}

  getTopicsList(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/popularTopics/list`);
  }
}
