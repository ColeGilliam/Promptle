import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { take } from 'rxjs';
import { AuthenticationService } from '../../services/authentication.service';
import {
  ConnectionsGameData,
  ConnectionsGameService,
  ConnectionsGroup,
} from '../../services/connections-game';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { GameFeedbackService } from '../../services/game-feedback';
import { GameFeedbackCard } from '../../shared/ui/game-feedback-card/game-feedback-card';
import { CustomGameSessionService } from '../../services/custom-game-session';

interface BoardWord {
  // Stable keys let the board keep selection/shake state even as tiles are shuffled or removed.
  key: string;
  label: string;
  groupIndex: number;
}

interface ConnectionsGroupState extends ConnectionsGroup {
  // The API group plus board-only metadata for solved ordering and reveal state.
  index: number;
  wordKeys: string[];
  revealed: boolean;
}

@Component({
  selector: 'app-connections',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    NavbarComponent,
    GameFeedbackCard,
  ],
  templateUrl: './connections.html',
  styleUrls: ['./connections.css'],
})
export class ConnectionsComponent implements OnInit, OnDestroy {
  readonly maxMistakes = 4;

  // Topic form + request lifecycle state.
  topic = '';
  activeTopic = '';
  loading = false;
  error = '';
  feedback = 'Enter a topic and generate a Connections board.';
  feedbackTone: 'neutral' | 'success' | 'one_away' | 'danger' = 'neutral';
  // Overall board state and access flags.
  mistakesLeft = this.maxMistakes;
  gameOver = false;
  gameWon = false;
  showTopicPrompt = true;
  isDevAccount = false;
  allowAllAIGeneration = false;

  // Live board state for the current puzzle.
  selectedWordKeys: string[] = [];
  shakingWordKeys: string[] = [];
  boardWords: BoardWord[] = [];
  solvedGroups: ConnectionsGroupState[] = [];
  remainingGroups: ConnectionsGroupState[] = [];
  isResolvingGuess = false;
  feedbackChoice: boolean | null = null;
  feedbackSubmitting = false;
  feedbackError = '';
  private auth0Id = '';
  private currentPlayId = '';
  private sessionInteracted = false;
  private sessionFinalized = false;

  // Hold onto the shake timer so a reset/new generation can cancel stale animations cleanly.
  private shakeTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private auth: AuthenticationService,
    private connectionsGameService: ConnectionsGameService,
    private http: HttpClient,
    private gameFeedbackService: GameFeedbackService,
    private customGameSessionService: CustomGameSessionService
  ) {}

  ngOnInit(): void {
    // Frontend mirrors the same AI-generation gate the backend enforces.
    this.loadDevSettings();

    this.auth.user$.subscribe((user) => {
      this.isDevAccount = user?.email === 'promptle99@gmail.com';
      this.auth0Id = user?.sub ?? '';
    });
  }

  ngOnDestroy(): void {
    // Treat leaving an active custom board as abandonment once the player has interacted.
    this.finalizeCurrentSession('abandoned', { keepalive: true });
  }

  get canUseAI(): boolean {
    // Dev account always has access; everyone else depends on the global setting.
    return this.isDevAccount || this.allowAllAIGeneration;
  }

  get hasGame(): boolean {
    // The board counts as active once any generated groups or remaining tiles exist.
    return this.solvedGroups.length > 0 || this.remainingGroups.length > 0 || this.boardWords.length > 0;
  }

  get showGameLayout(): boolean {
    // Keep the board shell visible while the backend is still generating the puzzle.
    return this.loading || this.hasGame;
  }

  get selectedCount(): number {
    return this.selectedWordKeys.length;
  }

  get mistakeHearts(): boolean[] {
    // Drive the UI hearts with a simple boolean array instead of hard-coding four icons in the template.
    return Array.from({ length: this.maxMistakes }, (_value, index) => index < this.mistakesLeft);
  }

  get canSubmitSelection(): boolean {
    // Submit is only legal when exactly four words are selected and no transition is in progress.
    return this.selectedWordKeys.length === 4 && !this.loading && !this.gameOver && !this.isResolvingGuess;
  }

  get canShuffleBoard(): boolean {
    // Solved/revealed states should freeze the board so shuffle only applies to active unsolved tiles.
    return this.boardWords.length > 1 && !this.loading && !this.gameOver && !this.isResolvingGuess;
  }

  get showGameFeedback(): boolean {
    return this.gameOver && !!this.activeTopic;
  }

  get solvedCount(): number {
    // Revealed answers after a loss should not count as player-solved groups.
    return this.solvedGroups.filter((group) => !group.revealed).length;
  }

  get feedbackIcon(): string {
    // Map the current feedback tone to a matching Material icon for the board banner.
    switch (this.feedbackTone) {
      case 'success':
        return 'task_alt';
      case 'one_away':
        return 'priority_high';
      case 'danger':
        return 'close';
      default:
        return 'tips_and_updates';
    }
  }

  generateGame(): void {
    const normalizedTopic = this.topic.trim();
    if (!normalizedTopic || this.loading || !this.canUseAI) return;

    this.loading = true;
    this.clearPendingShake();
    // Move into the board view immediately so generation feels responsive instead of blocking on the form.
    this.resetBoardState();
    this.activeTopic = normalizedTopic;
    this.showTopicPrompt = false;
    this.error = '';
    this.feedback = 'Generating a deceptive board...';
    this.feedbackTone = 'neutral';

    this.auth.user$.pipe(take(1)).subscribe((user) => {
      // Pull the current auth id once so the backend can apply the same dev-account access rules.
      this.connectionsGameService.generateGame(normalizedTopic, user?.sub || '').subscribe({
        next: (game) => {
          this.applyGame(game);
          this.loading = false;
        },
        error: (err) => {
          // On failure, fall back to the prompt form so the player can retry immediately.
          this.loading = false;
          this.error = err?.error?.error ?? 'Failed to generate a Connections puzzle.';
          this.activeTopic = '';
          this.showTopicPrompt = true;
          this.feedback = 'Try a different topic or try again.';
          this.feedbackTone = 'danger';
        },
      });
    });
  }

  toggleWordSelection(word: BoardWord): void {
    if (this.loading || this.gameOver || this.isResolvingGuess) return;

    const existingIndex = this.selectedWordKeys.indexOf(word.key);
    if (existingIndex >= 0) {
      this.selectedWordKeys = this.selectedWordKeys.filter((selectedWordKey) => selectedWordKey !== word.key);
      return;
    }

    // Connections only allows four active guesses at a time.
    if (this.selectedWordKeys.length >= 4) return;
    this.markSessionInteracted();
    this.selectedWordKeys = [...this.selectedWordKeys, word.key];
  }

  clearSelection(): void {
    // Do not mutate selection while a wrong-answer shake is being resolved.
    if (this.loading || this.isResolvingGuess) return;
    this.selectedWordKeys = [];
  }

  requestNewTopic(): void {
    // Resetting from the sidebar should fully clear the old board before exposing the prompt again.
    const confirmed = window.confirm('Start a new topic? Your current Connections board will be cleared.');
    if (!confirmed) return;

    this.finalizeCurrentSession('abandoned', { keepalive: true });
    this.resetBoardState();
    this.topic = '';
    this.showTopicPrompt = true;
  }

  submitGameFeedback(liked: boolean): void {
    if (!this.showGameFeedback || this.feedbackSubmitting || this.feedbackChoice !== null) return;

    this.feedbackSubmitting = true;
    this.feedbackError = '';

    this.auth.user$.pipe(take(1)).subscribe((user) => {
      this.gameFeedbackService.submitFeedback({
        auth0Id: user?.sub || '',
        topic: this.activeTopic,
        liked,
        gameType: 'connections',
        result: this.gameWon ? 'won' : 'revealed',
      }).subscribe({
        next: () => {
          this.feedbackChoice = liked;
          this.feedbackSubmitting = false;
        },
        error: () => {
          this.feedbackChoice = liked;
          this.feedbackSubmitting = false;
        },
      });
    });
  }

  private loadDevSettings(): void {
    // Read the same global setting the home page uses so the Connections page can hide its own prompt.
    this.http.get<{ allowAllAIGeneration?: boolean }>('/api/dev-settings').subscribe({
      next: (data) => {
        this.allowAllAIGeneration = data.allowAllAIGeneration ?? false;
      },
      error: () => {
        this.allowAllAIGeneration = false;
      },
    });
  }

  shuffleBoard(): void {
    // Shuffle only affects unsolved tiles; solved rows stay locked in difficulty order.
    if (!this.canShuffleBoard) return;
    this.boardWords = this.shuffleArray([...this.boardWords]);
  }

  submitSelection(): void {
    if (!this.canSubmitSelection) return;

    // A correct guess removes those tiles from the unsolved grid and re-renders them as a solved row.
    const matchedGroup = this.remainingGroups.find((group) => this.matchesGroup(group));

    if (matchedGroup) {
      this.solvedGroups = this.sortGroups([
        ...this.solvedGroups,
        matchedGroup,
      ]);
      this.remainingGroups = this.remainingGroups.filter((group) => group.index !== matchedGroup.index);
      this.boardWords = this.boardWords.filter((word) => word.groupIndex !== matchedGroup.index);
      this.selectedWordKeys = [];

      if (this.remainingGroups.length === 0) {
        this.feedback = 'Board cleared. All four connections are solved.';
        this.feedbackTone = 'success';
        this.gameOver = true;
        this.gameWon = true;
        this.finalizeCurrentSession('completed');
      } else {
        this.feedback = `Solved: ${matchedGroup.category}`;
        this.feedbackTone = 'success';
      }
      return;
    }

    const attemptedWordKeys = [...this.selectedWordKeys];
    this.mistakesLeft -= 1;
    const oneAway = this.remainingGroups.some((group) => this.selectedOverlapCount(group) === 3);
    this.isResolvingGuess = true;
    this.shakingWordKeys = attemptedWordKeys;
    this.feedback = oneAway
      ? 'One away. Three of those words belong together.'
      : 'Not a group. Try a different mix.';
    this.feedbackTone = oneAway ? 'one_away' : 'danger';

    this.clearPendingShake();
    this.shakeTimeout = setTimeout(() => {
      // Keep wrong guesses selected after the animation so the player can adjust instead of rebuilding.
      this.shakeTimeout = null;
      this.shakingWordKeys = [];
      this.isResolvingGuess = false;

      if (this.mistakesLeft <= 0) {
        this.revealRemainingGroups();
        this.feedback = 'Out of lives! Answers are now revealed.';
        this.feedbackTone = 'danger';
      }
    }, 430);
  }

  isSelected(wordKey: string): boolean {
    return this.selectedWordKeys.includes(wordKey);
  }

  isSelectionLocked(wordKey: string): boolean {
    // Once four words are selected, non-selected tiles become temporarily inert until the player changes the set.
    return !this.isSelected(wordKey) && this.selectedWordKeys.length >= 4;
  }

  isShaking(wordKey: string): boolean {
    return this.shakingWordKeys.includes(wordKey);
  }

  trackWord(_index: number, word: BoardWord): string {
    // Stable tracking avoids tile re-creation when the board reorders or selection changes.
    return word.key;
  }

  trackGroup(_index: number, group: ConnectionsGroupState): string {
    // Groups stay stable by original position, with category included as a readable fallback discriminator.
    return `${group.index}-${group.category}`;
  }

  private applyGame(game: ConnectionsGameData): void {
    this.clearPendingShake();
    this.activeTopic = game.topic;
    this.showTopicPrompt = false;
    this.error = '';
    this.mistakesLeft = this.maxMistakes;
    this.gameOver = false;
    this.gameWon = false;
    this.selectedWordKeys = [];
    this.shakingWordKeys = [];
    this.isResolvingGuess = false;
    this.resetGameFeedback();

    const groups: ConnectionsGroupState[] = [];
    const words: BoardWord[] = [];

    // Flatten API groups into shuffled tile state while keeping the original group membership for validation.
    game.groups.forEach((group, groupIndex) => {
      const wordKeys = group.words.map((word, wordIndex) => {
        const key = `g${groupIndex}-w${wordIndex}`;
        words.push({
          key,
          label: word,
          groupIndex,
        });
        return key;
      });

      groups.push({
        ...group,
        index: groupIndex,
        wordKeys,
        revealed: false,
      });
    });

    this.remainingGroups = groups;
    this.solvedGroups = [];
    this.boardWords = this.shuffleArray(words);
    this.feedback = 'Select four words that share a connection.';
    this.feedbackTone = 'neutral';
    this.startSession(game.topic);
  }

  private matchesGroup(group: ConnectionsGroupState): boolean {
    // A solved match means every key for that group is present in the current four-word selection.
    return group.wordKeys.every((wordKey) => this.selectedWordKeys.includes(wordKey));
  }

  private selectedOverlapCount(group: ConnectionsGroupState): number {
    // Used for the "one away" hint by counting how many selected tiles belong to a single true group.
    return group.wordKeys.filter((wordKey) => this.selectedWordKeys.includes(wordKey)).length;
  }

  private revealRemainingGroups(): void {
    // When the player runs out of mistakes, fold the unsolved groups into the solved area as revealed answers.
    this.solvedGroups = this.sortGroups([
      ...this.solvedGroups,
      ...this.remainingGroups.map((group) => ({ ...group, revealed: true })),
    ]);
    this.remainingGroups = [];
    this.boardWords = [];
    this.selectedWordKeys = [];
    this.gameOver = true;
    this.gameWon = false;
  }

  private sortGroups(groups: ConnectionsGroupState[]): ConnectionsGroupState[] {
    // Keep solved/revealed rows in original difficulty order rather than solve order.
    return [...groups].sort((left, right) => left.index - right.index);
  }

  private clearPendingShake(): void {
    // Prevent old timers from mutating state after a reset, regeneration, or solved board transition.
    if (!this.shakeTimeout) return;
    clearTimeout(this.shakeTimeout);
    this.shakeTimeout = null;
  }

  private resetBoardState(): void {
    // Central reset used by new-topic flow and by the transition into loading a fresh AI board.
    this.clearPendingShake();
    this.activeTopic = '';
    this.error = '';
    this.feedback = 'Enter a topic and generate a Connections board.';
    this.feedbackTone = 'neutral';
    this.mistakesLeft = this.maxMistakes;
    this.gameOver = false;
    this.gameWon = false;
    this.selectedWordKeys = [];
    this.shakingWordKeys = [];
    this.boardWords = [];
    this.solvedGroups = [];
    this.remainingGroups = [];
    this.isResolvingGuess = false;
    this.resetGameFeedback();
    this.resetSessionState();
  }

  private resetGameFeedback(): void {
    this.feedbackChoice = null;
    this.feedbackSubmitting = false;
    this.feedbackError = '';
  }

  private createPlayId(): string {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  private resetSessionState(): void {
    this.currentPlayId = '';
    this.sessionInteracted = false;
    this.sessionFinalized = false;
  }

  // Start one trackable custom-game session so later interaction/finalization calls all refer back to the same play attempt.
  private startSession(topic: string): void {
    const auth0Id = this.auth0Id.trim();
    if (!auth0Id) {
      this.resetSessionState();
      return;
    }

    const playId = this.createPlayId();
    this.currentPlayId = playId;
    this.sessionInteracted = false;
    this.sessionFinalized = false;

    this.customGameSessionService.startSession({
      playId,
      auth0Id,
      topic,
      gameType: 'connections',
    }).subscribe({
      error: () => {
        this.resetSessionState();
      },
    });
  }

  // Record the first meaningful move so we can identify a session as abandoned only if the user played at all.
  private markSessionInteracted(): void {
    const auth0Id = this.auth0Id.trim();
    if (!auth0Id || !this.currentPlayId || this.sessionInteracted) return;

    this.sessionInteracted = true;
    this.customGameSessionService.markInteracted({
      playId: this.currentPlayId,
      auth0Id,
    }).subscribe({
      error: () => {
        this.sessionInteracted = false;
      },
    });
  }

  // Close the active session once when the board is solved or the player leaves mid-game, which turns the session into recommendation signal.
  private finalizeCurrentSession(
    finalState: 'completed' | 'abandoned',
    options: { keepalive?: boolean } = {}
  ): void {
    const auth0Id = this.auth0Id.trim();
    if (!auth0Id || !this.currentPlayId || this.sessionFinalized) return;
    // Same-topic resets do not call this path; only real exits or completed boards should finalize.
    if (finalState === 'abandoned' && (!this.sessionInteracted || this.gameOver)) return;

    this.sessionFinalized = true;
    this.customGameSessionService.finalizeSession(
      {
        playId: this.currentPlayId,
        auth0Id,
        finalState,
      },
      options
    ).subscribe({
      error: () => {
        this.sessionFinalized = false;
      },
    });
  }

  private shuffleArray<T>(items: T[]): T[] {
    // Standard Fisher-Yates shuffle for client-side tile order randomization.
    const next = [...items];
    for (let index = next.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    }
    return next;
  }
}
