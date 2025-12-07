import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';


export interface TopicInfo {
  topicId: number;
  topicName: string;
}
@Injectable({
  providedIn: 'root'
})
export class TopicsListService {
  private baseUrl = 'http://localhost:3001/api';

  constructor(private http: HttpClient) {}

  getTopicsList(): Observable<TopicInfo[]> {
    return this.http.get<TopicInfo[]>(`${this.baseUrl}/popularTopics/list`);
  }
}
