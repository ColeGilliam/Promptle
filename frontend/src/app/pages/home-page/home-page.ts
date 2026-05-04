import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopicsListService, TopicInfo } from '../../services/topics-list';
import { findBestTopicMatch } from '../../services/topic-match';
import { Router, RouterModule } from '@angular/router';
import { AuthenticationService } from '../../services/authentication.service';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { take } from 'rxjs';
import { RecommendationItem, RecommendationsService } from '../../services/recommendations';
import { BillingService } from '../../services/billing.service';
import { AiUpgradeNoticeComponent } from '../../shared/ui/ai-upgrade-notice/ai-upgrade-notice';

// Angular Material modules
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';

import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { MiniFooterComponent } from '../../shared/ui/minifooter/minifooter';
import { SwitchMode } from '../../shared/ui/switch-mode/switch-mode';
import { LoadSavedGameCard } from '../../shared/ui/load-saved-game-card/load-saved-game-card';
import { DailyGameCtaComponent } from '../../shared/ui/daily-game-cta/daily-game-cta';

interface TopicValidationResponse {
  allowed?: boolean;
  topic?: string;
  error?: string;
  code?: string;
}

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
    MatProgressSpinnerModule,
    MatIconModule,
    MatCheckboxModule,
    RouterModule,
    NavbarComponent,
    MiniFooterComponent,
    MatAutocompleteModule,
    SwitchMode,
    LoadSavedGameCard,
    DailyGameCtaComponent,
    AiUpgradeNoticeComponent,
  ],
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.css'],
})
export class HomePage implements OnInit, AfterViewInit, OnDestroy {
  topicNames: string[] = [];
  allTopics: TopicInfo[] = [];
  selectedTopic: TopicInfo | null = null;
  selectedTopicQuery = '';
  filteredTopics: TopicInfo[] = [];
  customTopic = '';
  customTopicError = '';
  matchedCustomTopic: TopicInfo | null = null;
  improvedGeneration = false;
  recommendations: RecommendationItem[] = [];
  isCustomTopicFocused = false;

  isMultiplayer = false;  // false = single-player, true = multiplayer
  multiplayerMode: 'standard' | 'chaos' | '1v1' = 'standard'; // only relevant when isMultiplayer = true
  isCreatingRoom = false; // true while waiting for MP room creation API
  isValidatingCustomTopic = false;
  createRoomError = '';
  private revealObserver?: IntersectionObserver;

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
  isDevAccount = false;
  myAuth0Id = '';

  // Dev settings (fetched from backend)
  allowGuestsCreateRooms = false;
  allowAllAIGeneration = false;
  dailyGames: Record<string, { topic?: string; date?: string; available?: boolean }> = {};

  get canCreateRooms(): boolean {
    return this.isDevAccount || this.allowGuestsCreateRooms;
  }

  hasAIAccess = false;
  upgradeNoticeVisible = true;

  get canUseAI(): boolean { return true; }
  get aiInputDisabled(): boolean { return !this.hasAIAccess; }
  get isGuest(): boolean { return !this.isLoggedIn; }

  login() { this.auth.login(); }

  onUpgradeDismissed() { this.upgradeNoticeVisible = false; }
  onLockedInputClick() { if (!this.hasAIAccess) this.upgradeNoticeVisible = true; }

  get promptleDailyGame(): { topic?: string; date?: string; available?: boolean } | null {
    return this.dailyGames['promptle'] || null;
  }

  get resolvedCustomTopicMatch(): TopicInfo | null {
    if (!this.matchedCustomTopic) return null;
    if (this.isMultiplayer && !this.canCreateRooms) return null;
    return this.matchedCustomTopic;
  }

  get customTopicIdeas(): RecommendationItem[] {
    return this.recommendations.filter((item) => item.type === 'custom').slice(0, 3);
  }

  get showCustomTopicIdeas(): boolean {
    return !this.isMultiplayer && this.isLoggedIn && this.isCustomTopicFocused && this.customTopicIdeas.length > 0;
  }

  constructor(
    private topicsService: TopicsListService,
    private router: Router,
    private auth: AuthenticationService,
    private http: HttpClient,
    private recommendationsService: RecommendationsService,
    private billingService: BillingService,
  ) { }

  ngOnInit() {
    this.getTopics();
    this.refreshSavedGameState(); // Single-player init
    this.loadDevSettings();

    // Subscribe to Auth0's real authentication state
    this.auth.isAuthenticated$.subscribe((status) => {
      this.isLoggedIn = status;
      if (!status) {
        this.recommendations = [];
      }
    });

    this.auth.user$.subscribe((user) => {
      if (user) {
        this.displayName = user.name ?? '';
        this.myAuth0Id = user.sub ?? '';
        this.isDevAccount = user.email === 'promptle99@gmail.com';
        this.registerUser(user);
        this.loadRecommendations();
        this.billingService.getStatus(user.sub!).subscribe(s => {
          this.hasAIAccess = s?.hasAccess ?? false;
        });
        // Re-run observer so AI card (now in DOM) gets picked up
        setTimeout(() => this.setupRevealObserver(), 50);
        return;
      }

      this.myAuth0Id = '';
      this.recommendations = [];
    });
  }

  ngAfterViewInit() {
    this.refreshSavedGameState();
    this.setupRevealObserver();
  }

  ngOnDestroy() {
    this.revealObserver?.disconnect();
  }

  private setupRevealObserver() {
    this.revealObserver?.disconnect();
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            el.classList.add('reveal--visible');
            el.addEventListener('animationend', () => {
              el.classList.remove('reveal--visible');
              el.style.opacity = '1';
            }, { once: true });
            this.revealObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );

    document.querySelectorAll('.reveal:not(.reveal--visible)').forEach(el => {
      this.revealObserver!.observe(el);
    });
  }

  loadDevSettings() {
    this.http.get<any>('/api/dev-settings').subscribe({
      next: (data) => {
        this.allowGuestsCreateRooms = data.allowGuestsCreateRooms ?? false;
        this.allowAllAIGeneration = data.allowAllAIGeneration ?? false;
        this.dailyGames = data.dailyGames ?? {};
        // Re-run observer so AI card (now in DOM) gets picked up
        setTimeout(() => this.setupRevealObserver(), 50);
      },
      error: () => { /* silently fall back to defaults */ }
    });
  }

  // ────────────────────────────────────────────────
  // Mode toggle (shared, but effects gated by isMultiplayer)
  // ────────────────────────────────────────────────
  onModeChange(isSingle: boolean) {
    this.isMultiplayer = !isSingle;
    if (!this.isMultiplayer) this.multiplayerMode = 'standard';
    // Reset reveal state so all cards animate in on every mode switch
    document.querySelectorAll('.reveal--visible').forEach(el => {
      el.classList.remove('reveal--visible');
    });
    setTimeout(() => this.setupRevealObserver(), 50);
  }

  // ────────────────────────────────────────────────
  // Unified start game — branches by mode
  // ────────────────────────────────────────────────
  startSelectedGame(isAi: boolean = false) {
    let payload: { topic?: string; id?: number };

    if (isAi) {
      const topic = this.customTopic.trim();
      if (!topic) return;
      const matchedTopic = this.resolvedCustomTopicMatch;
      if (!matchedTopic) {
        this.validateAndStartCustomGeneratedGame(topic);
        return;
      }
      payload = { id: matchedTopic.topicId };
    } else {
      if (!this.selectedTopic) return;
      payload = { id: this.selectedTopic.topicId };
    }

    this.startGameFromPayload(payload);
  }

  // Button handlers
  startGame() {
    this.startSelectedGame(false);
  }

  startAiGame() {
    this.startSelectedGame(true);
  }

  startMatchedCustomGame() {
    const matchedTopic = this.resolvedCustomTopicMatch;
    if (!matchedTopic) return;

    this.startGameFromPayload({ id: matchedTopic.topicId });
  }

  startCustomGeneratedGame() {
    const topic = this.customTopic.trim();
    if (!topic) return;

    this.validateAndStartCustomGeneratedGame(topic);
  }

  startRecommendedCustomTopic(item: RecommendationItem) {
    this.startGameFromPayload({ topic: item.topic });
  }

  startDailyPromptle() {
    // Clear any in-progress single-player state before jumping into the shared daily puzzle.
    this.newGame();
    this.router.navigate(['/game'], { queryParams: { daily: 'true' } });
  }

  onCustomTopicFocus() {
    this.isCustomTopicFocused = true;
  }

  onCustomTopicBlur() {
    window.setTimeout(() => {
      this.isCustomTopicFocused = false;
    }, 120);
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
    setTimeout(() => this.setupRevealObserver(), 50);
  }

  continueSaved() {
    this.showLoadConfirm = false;
    this.router.navigate(['/game'], { queryParams: { loadSaved: 'true' } });
  }

  restartSaved() {
    this.showLoadConfirm = false;
    this.router.navigate(['/game'], { queryParams: { restartSaved: 'true' } });
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
            setTimeout(() => this.setupRevealObserver(), 50);
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
          setTimeout(() => this.setupRevealObserver(), 50);
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
        this.filterTopics(this.selectedTopicQuery);
        this.updateCustomTopicMatch();

        const topicIds = data.map(t => t.topicId);
      },
      error: (err) => console.error(err)
    });
  }

  onTopicQueryChange(query: string) {
    this.selectedTopicQuery = query;
    this.filterTopics(query);
    // Deselect if the selected topic no longer appears in filtered results
    if (this.selectedTopic && !this.selectedTopic.topicName.toLowerCase().includes(query.trim().toLowerCase())) {
      this.selectedTopic = null;
    }
  }

  onTopicOptionSelected(topicName: string) {
    this.selectedTopic =
      this.allTopics.find(topic => topic.topicName === topicName) ?? null;
    this.selectedTopicQuery = topicName;
    this.filterTopics(topicName);
  }

  onCustomTopicChange(topic: string) {
    this.customTopic = topic;
    this.customTopicError = '';
    this.updateCustomTopicMatch();
  }

  private validateAndStartCustomGeneratedGame(topic: string) {
    if (this.isValidatingCustomTopic || this.isCreatingRoom) return;

    this.isValidatingCustomTopic = true;
    this.customTopicError = '';
    this.http.post<TopicValidationResponse>('/api/subjects/validate-topic', {
      topic,
      auth0Id: this.myAuth0Id,
    }).subscribe({
      next: (result) => {
        this.isValidatingCustomTopic = false;
        if (!result.allowed) {
          this.rejectCustomTopic(result.error);
          return;
        }
        this.startGameFromPayload({ topic: result.topic || topic });
      },
      error: (err) => {
        this.isValidatingCustomTopic = false;
        this.rejectCustomTopic(err?.error?.error);
      },
    });
  }

  private rejectCustomTopic(message?: string) {
    this.matchedCustomTopic = null;
    this.customTopicError = message || 'That topic is not allowed. Please try a different topic.';
  }

  get customTopicActionLabel(): string {
    if (this.resolvedCustomTopicMatch) {
      return this.isMultiplayer ? 'PLAY POPULAR TOPIC' : 'PLAY POPULAR TOPIC';
    }

    return this.isMultiplayer ? 'CREATE CUSTOM GAME' : 'CREATE CUSTOM GAME';
  }

  get customGeneratedActionLabel(): string {
    return this.isMultiplayer ? 'CREATE CUSTOM GAME' : 'CREATE CUSTOM GAME';
  }

  get matchedTopicActionLabel(): string {
    return 'PLAY POPULAR TOPIC';
  }

  private resolveCustomTopic(topic: string): TopicInfo | null {
    return findBestTopicMatch(topic, this.allTopics);
  }

  private updateCustomTopicMatch() {
    this.matchedCustomTopic = this.resolveCustomTopic(this.customTopic);
  }

  private loadRecommendations() {
    const auth0Id = this.myAuth0Id.trim();
    if (!auth0Id) {
      this.recommendations = [];
      return;
    }

    this.recommendationsService.getRecommendations(auth0Id).subscribe({
      next: ({ items }) => {
        this.recommendations = items ?? [];
        setTimeout(() => this.setupRevealObserver(), 50);
      },
      error: () => {
        this.recommendations = [];
      },
    });
  }

  private startGameFromPayload(payload: { topic?: string; id?: number }) {
    const useImprovedGeneration = !!payload.topic && this.improvedGeneration;

    if (this.isMultiplayer) {
      const roomPayload = {
        ...payload,
        mode: this.multiplayerMode,
        auth0Id: this.myAuth0Id,
        ...(useImprovedGeneration ? { improvedGeneration: true } : {}),
      };

      this.isCreatingRoom = true;
      this.createRoomError = '';
      this.http.post<{ roomId: string }>('/api/game/multiplayer', roomPayload)
        .subscribe({
          next: (res) => {
            this.isCreatingRoom = false;
            this.router.navigate(['/game'], {
              queryParams: { room: res.roomId }
            });
          },
          error: (err) => {
            this.isCreatingRoom = false;
            this.createRoomError = err?.error?.error ?? 'Could not create multiplayer room. Please try again.';
            console.error('Failed to create multiplayer room:', err);
          }
        });
      return;
    }

    const queryParams = payload.topic
      ? {
          topic: payload.topic,
          ...(useImprovedGeneration ? { improved: '1' } : {}),
        }
      : { id: payload.id };
    this.newGame();
    this.router.navigate(['/game'], { queryParams });
  }

  private filterTopics(query: string) {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      this.filteredTopics = [...this.allTopics];
      return;
    }

    this.filteredTopics = this.allTopics.filter(topic =>
      topic.topicName.toLowerCase().includes(normalized)
    );
  }

  joinChatRoom() {
    this.router.navigate(['/lobby']);
  }

}
