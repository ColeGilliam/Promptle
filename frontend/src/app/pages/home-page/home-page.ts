import { Component, OnInit, AfterViewInit } from '@angular/core';
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
import { MatInputModule } from '@angular/material/input';

import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { ToggleMode } from "../../shared/ui/toggle-mode/toggle-mode"; // Assuming this is the correct import; swap to SwitchMode if needed
import { BottomHeaderComponent } from '../../shared/ui/bottom-header/bottom-header';

@Component({
  selector: 'app-home-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatButtonModule,
    NavbarComponent,
    ToggleMode,
    BottomHeaderComponent
  ],
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.css'],
})
export class HomePage implements OnInit, AfterViewInit {
  topicNames: string[] = [];
  allTopics: TopicInfo[] = [];
  selectedTopic: TopicInfo | null = null;
  customTopic = '';

  isMultiplayer = false;  // false = single-player, true = multiplayer

  // UI state for load-confirmation overlay (single-player only)
  showLoadConfirm = false;

  // Cached saved-game metadata shown in confirmation (single-player only)
  savedGameTopic: string | null = null;
  savedGameSavedAt: string | null = null;

  // Whether a saved singleplayer game exists
  get hasSavedGame(): boolean {
    return !!this.savedGameTopic;
  }

  // FAKE LOG IN STATE FOR UI
  isLoggedIn = false;
  displayName = 'future username display';

  constructor(
    private topicsService: TopicsListService,
    private router: Router,
    private auth: AuthenticationService,
    private http: HttpClient
  ) { }

  ngOnInit() {
    this.getTopics();
    this.refreshSavedGameState(); // Single-player init

    // Subscribe to Auth0's real authentication state
    this.auth.isAuthenticated$.subscribe((status) => {
      this.isLoggedIn = status;
    });

    this.auth.user$.subscribe((user) => {
      if (user) {
        this.displayName = user.name ?? '';
        this.registerUser(user);
      }
    });
  }

  ngAfterViewInit() {
    this.refreshSavedGameState();
  }

  // ────────────────────────────────────────────────
  // Mode toggle (shared, but effects gated by isMultiplayer)
  // ────────────────────────────────────────────────
  onModeChange(isSingle: boolean) {
    this.isMultiplayer = !isSingle;
    console.log('Mode changed to:', this.isMultiplayer ? 'Multiplayer' : 'Singleplayer');
  }

  // ────────────────────────────────────────────────
  // Unified start game — branches by mode
  // ────────────────────────────────────────────────
  startSelectedGame(isAi: boolean = false) {
    let payload: any;

    if (isAi) {
      const topic = this.customTopic.trim();
      if (!topic) return;
      payload = { topic };
    } else {
      if (!this.selectedTopic) return;
      payload = { id: this.selectedTopic.topicId };
    }

    if (this.isMultiplayer) {
      // MULTIPLAYER: create room on backend
      this.http.post<{ roomId: string }>('/api/game/multiplayer', payload)
        .subscribe({
          next: (res) => {
            this.router.navigate(['/game'], {
              queryParams: { room: res.roomId }
            });
          },
          error: (err) => {
            console.error('Failed to create multiplayer room:', err);
            alert('Could not create multiplayer room. Check backend.');
          }
        });
    } else {
      // SINGLE PLAYER: direct navigation
      const queryParams = isAi ? { topic: payload.topic } : { id: payload.id };
      this.newGame(); // Refresh saved metadata
      this.router.navigate(['/game'], { queryParams });
    }
  }

  // Button handlers
  startGame() {
    this.startSelectedGame(false);
  }

  startAiGame() {
    this.startSelectedGame(true);
  }

  // ────────────────────────────────────────────────
  // Single-player saved game logic (gated by !isMultiplayer in HTML)
  // ────────────────────────────────────────────────
  refreshSavedGameState() {
    if (this.isMultiplayer) return; // Disabled in multiplayer

    // If user is logged in, query server for their saved game. Otherwise read localStorage.
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user && user.sub) {
        this.http.get<any>(`/api/load-game/${encodeURIComponent(user.sub)}`).subscribe({
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
    if (this.isMultiplayer) return; // Disabled in multiplayer

    this.refreshSavedGameState();
    if (this.hasSavedGame) {
      this.showLoadConfirm = true;
    } else {
      // If no save, just navigate directly to game
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

  /** Ask user to confirm deletion, then delete saved game */
  deleteSavedConfirm() {
    if (this.isMultiplayer) return; // Disabled in multiplayer

    const ok = confirm('Delete saved game? This cannot be undone.');
    if (!ok) return;
    this.deleteSavedGame();
  }

  deleteSavedGame() {
    // If logged in, call backend delete endpoint; otherwise remove localStorage key
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user && user.sub) {
        this.http.delete(`/api/delete-saved-game/${encodeURIComponent(user.sub)}`).subscribe({
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
    if (this.isMultiplayer) return; // Disabled in multiplayer
    // Backwards-compatible: directly navigate to load saved game
    this.router.navigate(['/game'], { queryParams: { loadSaved: 'true' } });
  }

  newGame() {
    // Start a new game but DO NOT delete the saved game from storage.
    // This keeps the "Load Game" option available even after starting a new game.
    // Optionally refresh saved metadata in case user wants to load later.
    if (this.isMultiplayer) return; // Not applicable in multiplayer
    this.refreshSavedGameState();
    console.log('Starting a new game (saved game preserved)');
  }

  // ────────────────────────────────────────────────
  // Multiplayer-specific
  // ────────────────────────────────────────────────
  createRoom() {
    if (!this.isMultiplayer) return; // Only in multi mode
    // Navigate to chat page; use query param to indicate room creation intent
    this.router.navigate(['/chat'], { queryParams: { create: 'true' } });
  }

  // ────────────────────────────────────────────────
  // Auth & Topics (shared)
  // ────────────────────────────────────────────────
  registerUser(user: any) {
    fetch('/api/auth-user', {
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

  joinChatRoom() {
    this.router.navigate(['/chat']);
  }
}