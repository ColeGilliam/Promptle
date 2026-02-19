import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopicsListService, TopicInfo } from '../../services/topics-list';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authentication.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { take } from 'rxjs';

// Angular Material modules
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';

import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { ToggleMode } from "../../shared/ui/toggle-mode/toggle-mode";


@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatChipsModule,
    MatButtonModule,
    NavbarComponent,
    ToggleMode
  ],
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.css'],
})
export class HomePage implements OnInit {
  topicNames: string[] = [];
  allTopics: TopicInfo[] = [];   // this should be an array of TopicInfo
  selectedTopic: TopicInfo | null = null;
  customTopic = '';

  isSinglePlayerMode = true;
  multiplayer = false;
  onModeChange(isSingle: boolean) {
    console.log('Mode changed to: ', isSingle ? 'Singleplayer' : 'Multiplayer');
  }

  // UI state for load-confirmation overlay
  showLoadConfirm = false;

  // Cached saved-game metadata shown in confirmation
  savedGameTopic: string | null = null;
  savedGameSavedAt: string | null = null;

  // Whether a saved singleplayer game exists in localStorage
  get hasSavedGame(): boolean {
    return !!this.savedGameTopic;
  }

  ngAfterViewInit() {
    this.refreshSavedGameState();
  }

  refreshSavedGameState() {
    // If user is logged in, query server for their saved game. Otherwise read localStorage.
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user && user.sub) {
        this.http.get<any>(`http://localhost:3001/api/load-game/${encodeURIComponent(user.sub)}`).subscribe({
          next: (payload) => {
            this.savedGameTopic = payload?.topic ?? null;
            this.savedGameSavedAt = payload?.savedAt ? new Date(payload.savedAt).toLocaleString() : null;
          },
          error: () => {
            // No server-side saved game for this logged-in user. Do NOT fall back to localStorage.
            this.savedGameTopic = null;
            this.savedGameSavedAt = null;
          }
        });
      } else {
        this.readLocalSavedMetadata();
      }
    });
  }

  private readLocalSavedMetadata() {
    try {
      const raw = localStorage.getItem('promptle_saved_game');
      if (!raw) {
        this.savedGameTopic = null;
        this.savedGameSavedAt = null;
        return;
      }
      const payload = JSON.parse(raw);
      this.savedGameTopic = payload?.topic ?? null;
      this.savedGameSavedAt = payload?.savedAt ? new Date(payload.savedAt).toLocaleString() : null;
    } catch (e) {
      console.error('Failed to read saved game metadata', e);
      this.savedGameTopic = null;
      this.savedGameSavedAt = null;
    }
  }

  /** Show an inline confirmation for loading the saved game. */
  onLoadClicked() {
    this.refreshSavedGameState();
    if (this.hasSavedGame) {
      this.showLoadConfirm = true;
    } else {
      // If no save, just navigate directly to game (behaviour preserved)
      this.router.navigate(['/game']);
    }
  }

  cancelLoadConfirm() {
    this.showLoadConfirm = false;
  }

  continueSaved() {
    this.showLoadConfirm = false;
    this.router.navigate(['/game'], { queryParams: { loadSaved: 'true' } });
  }

  /** Ask user to confirm deletion, then delete saved game for logged-in user or localStorage for anonymous users */
  deleteSavedConfirm() {
    const ok = confirm('Delete saved game? This cannot be undone.');
    if (!ok) return;
    this.deleteSavedGame();
  }

  deleteSavedGame() {
    // If logged in, call backend delete endpoint; otherwise remove localStorage key
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user && user.sub) {
        this.http.delete(`http://localhost:3001/api/delete-saved-game/${encodeURIComponent(user.sub)}`).subscribe({
          next: () => {
            alert('Saved game deleted from your account.');
            this.showLoadConfirm = false;
            this.refreshSavedGameState();
          },
          error: (err) => {
            console.error('Failed to delete saved game on server', err);
            alert('Failed to delete saved game on server.');
          }
        });
      } else {
        try {
          localStorage.removeItem('promptle_saved_game');
          alert('Local saved game deleted.');
          this.showLoadConfirm = false;
          this.refreshSavedGameState();
        } catch (e) {
          console.error('Failed to delete local saved game', e);
          alert('Failed to delete local saved game.');
        }
      }
    });
  }

  loadSavedGame() {
    // Backwards-compatible: directly navigate to load saved game
    this.router.navigate(['/game'], { queryParams: { loadSaved: 'true' } });
  }

  newGame() {
    // Start a new game but DO NOT delete the saved game from storage.
    // This keeps the "Load Game" option available even after starting a new game.
    // Optionally refresh saved metadata in case user wants to load later.
    this.refreshSavedGameState();
    console.log('Starting a new game (saved game preserved)');
  }

  createRoom() {
    // Navigate to chat page; use query param to indicate room creation intent
    this.router.navigate(['/chat'], { queryParams: { create: 'true' } });
  }
  // FAKE LOG IN STATE FOR UI
  isLoggedIn = false;
  displayName = 'future username display';

  constructor(private topicsService: TopicsListService, private router: Router, private auth: AuthenticationService, private http: HttpClient) { }

  ngOnInit() {

    this.refreshSavedGameState();
    this.getTopics();
    // Subscribe to Auth0's real authentication state
    this.auth.isAuthenticated$.subscribe((status) => {
      this.isLoggedIn = status;
    });

    this.auth.user$.subscribe((user) => {
      if (user) {
        this.displayName = user.name ?? '';

        // Send user to backend
        this.registerUser(user);
      }
    });
  }

  registerUser(user: any) {
    fetch('http://localhost:3001/api/auth-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        auth0Id: user.sub,
        email: user.email,
        name: user.name,
        picture: user.picture
      })
    });
  }

  // TOGGLES FAKE LOG IN STATE
  toggleLogin() {
    if (this.isLoggedIn) {
      this.auth.logout();
    } else {
      this.auth.login();
    }
  }

  getTopics() {
    this.topicsService.getTopicsList().subscribe({
      next: (data: TopicInfo[]) => {
        console.log('Topics data from backend:', data);

        this.allTopics = data;

        this.topicNames = data.map(t => t.topicName);

        const topicIds = data.map(t => t.topicId);
      },
      error: (err) => console.error(err)
    });
  }

  startGame() {
    if (!this.selectedTopic) return;

    this.router.navigate(['/game'], {
      queryParams: {
        id: this.selectedTopic.topicId
      }
    });
  }

  startAiGame() {
    const topic = this.customTopic.trim();
    if (!topic) return;

    this.router.navigate(['/game'], {
      queryParams: { topic }
    });
  }

  joinChatRoom() {
    this.router.navigate(['/chat']);
  }
}
