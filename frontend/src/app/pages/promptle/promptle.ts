// promptle.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { DbGameService, GameData } from '../../services/setup-game';
import { ActivatedRoute, Router } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { AuthenticationService } from '../../services/authentication.service';
import { take } from 'rxjs';
import { HttpClient } from '@angular/common/http';

import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

@Component({
  selector: 'app-promptle',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    HttpClientModule, 
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    NavbarComponent
  ],
  templateUrl: './promptle.html',
  styleUrls: ['./promptle.css']
})
export class PromptleComponent implements OnInit {
  // === Game state driven by backend ===
  topic = '';
  headers: string[] = [];
  answers: { name: string; values: string[] }[] = [];
  correctAnswer: {name: string; values: string[]} = {name: '', values: []};
  selectedGuess = '';
  isGameOver = false;

  //showSettingsMenu = false;

  // Each submitted guess stores both the values and their color indicators
  submittedGuesses: { values: string[]; colors: string[] }[] = [];

  // Backend preview grid (shows the correct answer row)
  backendHeaders: string[] = [];
  backendRow: string[] = [];

  // Loading / error state
  gameLoading = false;
  gameError = '';

  constructor(private dbGameService: DbGameService, private router: Router, private route: ActivatedRoute, private auth: AuthenticationService, private http: HttpClient) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      const aiTopic = params.get('topic');
      const topicIdParam = params.get('id');
      const topicId = topicIdParam ? Number(topicIdParam) : NaN;

      if (aiTopic && aiTopic.trim()) {
        this.loadGame({ topic: aiTopic.trim() });
        return;
      }

      if (!isNaN(topicId)) {
        this.loadGame({ topicId });
        return;
      }

      this.gameError = 'No valid topic or game ID provided.';
    });
  }

    /**
   * Fetch a game via unified service (AI or DB depending on params)
   */
  private loadGame(params: { topic?: string; topicId?: number }) {
    this.gameLoading = true;
    this.gameError = '';

    this.dbGameService.fetchGame(params).subscribe({
      next: (data: GameData) => {
        this.applyGameData(data);
        this.gameLoading = false;
      },
      error: (err) => {
        console.error('Error loading game data:', err);
        this.gameError = err?.error?.error ?? err?.message ?? 'Failed to load game data';
        this.gameLoading = false;
      }
    });
  }
  
  /**
   * Apply fetched game data to the component state
   */
  private applyGameData(data: GameData) {
    this.topic = data.topic;
    this.headers = data.headers;
    this.answers = data.answers;
    this.correctAnswer = data.correctAnswer;

    // Build preview row from the matching correct answer
    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    if (correct) {
      this.backendHeaders = [...this.headers];
      this.backendRow = [...correct.values];
    } else {
      this.backendHeaders = [];
      this.backendRow = [];
    }

    // Reset guesses
    this.submittedGuesses = [];
    this.selectedGuess = '';
  }

    //Split a string into lowercase word tokens (for partial match scoring)
  tokenize(value: string): string[] {
    if (!value) return [];
    return value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
  }

  private handleWin() {
    this.isGameOver = true;

    // Update stats if logged in
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user?.sub) {
        this.http.post('http://localhost:3001/api/increment-win', { auth0Id: user.sub })
          .subscribe({
            next: () => console.log('Stat updated!'),
            error: (err) => console.error('Failed to update stats', err)
          });
      }
    });
  }

  // Submit a guess and calculate colors for feedback
  onSubmitGuess() {
    if (!this.selectedGuess || this.isGameOver) return;

    const guessed = this.answers.find(a => a.name === this.selectedGuess);
    const correct = this.answers.find(a => a.name === this.correctAnswer.name);
    if (!guessed || !correct) return;

    // Build a set of all tokens in correct answer values
    const correctTokensSet = new Set<string>();
    correct.values.forEach(v => this.tokenize(v).forEach(t => correctTokensSet.add(t)));

    // Determine colors for each column
    const colors = guessed.values.map((value, i) => {
      const correctValue = correct.values[i];

      if (value && correctValue && value.toLowerCase() === correctValue.toLowerCase()) {
        return 'green';
      }

      const guessTokens = this.tokenize(value);
      for (const t of guessTokens) {
        if (correctTokensSet.has(t)) return 'yellow';
      }

      return 'gray';
    });

    // Store the result
    this.submittedGuesses.push({
      values: guessed.values,
      colors: colors
    });

    if (this.selectedGuess === this.correctAnswer.name) {
      this.handleWin(); 
    }

    // Clear selection for next guess
    this.selectedGuess = '';
  }

  /*toggleSettingsMenu() {
    this.showSettingsMenu = !this.showSettingsMenu;
  }*/

  quitGame() {
    this.router.navigate(['/']);   // go back to home
  }
}
