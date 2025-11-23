import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

// Flexible shape of a raw document returned by /api/demo/one/random.
// We guarantee _id is there, and everything else is dynamic.
// This way you don't have to update this every time the DB schema changes.
export interface JDemoRecord {
  _id: string;
  character?: string;
  // any additional fields coming from MongoDB
  // e.g. character, gender, region, role, etc.
  [key: string]: string | number | boolean | null | undefined;
}

// Shape of the game data returned by /api/demo/game-data
// This is intentionally the same structure as the original mock-data.json.
// This one *should* stay stable so your UI logic is safe.
export interface GameData {
  topic: string;
  headers: string[];
  answers: { name: string; values: string[] }[];
  correctAnswer: string;
}

@Injectable({ providedIn: 'root' })
export class JDemoService {
  // Base URL for your backend API
  // TODO (future): when you deploy, change this to your production URL,
  // or read it from an environment file (environment.ts).
  private baseUrl = 'http://localhost:3001/api/demo';

  constructor(private http: HttpClient) {}

  // Get a single random raw record from J_Demo.
  //
  // Because JDemoRecord is flexible (index signature),
  // you can still do things like:
  //   record.character
  //   record.region
  // but you won't be forced to list them all in the interface.
  getRandom(): Observable<JDemoRecord> {
    return this.http.get<JDemoRecord>(`${this.baseUrl}/one/random`);
  }

  // Get full game data in the format the Promptle UI expects:
  // - topic/title for the page
  // - column headers
  // - full list of possible answers
  // - name of the correct answer
  //
  // TODO (future, ChatGPT integration):
  //  - You can add parameters here (e.g. topic, difficulty, user prompt) and
  //    pass them as query params or in a POST body. The backend can then:
  //      * call ChatGPT with the user's prompt
  //      * cache results to MongoDB
  //      * still return a GameData object.
  getGameData(): Observable<GameData> {
    return this.http.get<GameData>(`${this.baseUrl}/game-data`);
  }
}
