import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';
import { take } from 'rxjs';
import { AuthenticationService } from '../../services/authentication.service';
import { DailyGameMeta } from '../../services/setup-game';
import {
  createCrosswordPuzzleFromGame,
  createEmptyCrosswordGuesses,
  CrosswordClue,
  CrosswordDirection,
  CrosswordGameData,
  CrosswordGameService,
  CrosswordPosition,
  CrosswordPuzzle,
} from '../../services/crossword-game';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { LoadSavedGameCard } from '../../shared/ui/load-saved-game-card/load-saved-game-card';
import { GameFeedbackService } from '../../services/game-feedback';
import { CustomGameSessionService } from '../../services/custom-game-session';
import { SharedGameService } from '../../services/shared-game';
import { GameEndPopup, GameEndPopupStat } from '../../shared/ui/game-end-popup/game-end-popup';
import { DailyGameCtaComponent } from '../../shared/ui/daily-game-cta/daily-game-cta';
import { RecommendationItem, RecommendationsService } from '../../services/recommendations';
import { SettingsService } from '../../services/settings.service';
import { MiniFooterComponent } from '../../shared/ui/minifooter/minifooter';
import { BillingService } from '../../services/billing.service';
import { AiUpgradeNoticeComponent } from '../../shared/ui/ai-upgrade-notice/ai-upgrade-notice';
import { AppSnackbarService } from '../../shared/ui/app-snackbar/app-snackbar.service';

type FeedbackTone = 'neutral' | 'success' | 'danger';
const CROSSWORD_GENERATION_ERROR = 'Sorry! The crossword failed to generate. Please try again.';
const NON_ALPHANUMERIC_CELL_VALUE = /[^A-Z0-9]/g;

function sanitizeCrosswordCellValue(value: string): string {
  return value.toUpperCase().replace(NON_ALPHANUMERIC_CELL_VALUE, '').slice(0, 1);
}

// Keep enough UI state to restore a puzzle exactly as the player left it.
interface SavedCrosswordState {
  savedAt: number;
  game: CrosswordGameData;
  guesses: string[][];
  elapsedSeconds: number;
  completed: boolean;
  solvedAt: string | null;
  revealed: boolean;
  activeDirection: CrosswordDirection;
  activeCell: CrosswordPosition | null;
  wrongCellKeys: string[];
  checkedCorrectCellKeys: string[];
  checkedCorrectClueIds: string[];
  checkedIncorrectClueIds: string[];
  letterCheckCount: number;
  wordCheckCount: number;
  puzzleCheckCount: number;
  letterRevealCount: number;
  wordRevealCount: number;
  puzzleRevealCount: number;
}

interface ClueCheckSummary {
  allFilled: boolean;
  wrongCells: CrosswordPosition[];
  correctFilledCells: CrosswordPosition[];
}

@Component({
  selector: 'app-crossword',
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
    LoadSavedGameCard,
    GameEndPopup,
    DailyGameCtaComponent,
    MiniFooterComponent,
    AiUpgradeNoticeComponent,
  ],
  templateUrl: './crossword.html',
  styleUrls: ['./crossword.css'],
})
export class CrosswordComponent implements OnInit, OnDestroy {
  topic = '';
  loading = false;
  error = '';
  feedback = 'Enter a topic and generate a crossword.';
  feedbackTone: FeedbackTone = 'neutral';
  showTopicPrompt = true;
  isDevAccount = false;
  allowAllAIGeneration = false;
  dailyGameSummary: { topic?: string; date?: string; available?: boolean } | null = null;
  recommendations: RecommendationItem[] = [];
  isTopicFocused = false;

  activePuzzle: CrosswordPuzzle | null = null;
  activeGame: CrosswordGameData | null = null;
  guesses: string[][] = [];
  activeDirection: CrosswordDirection = 'across';
  activeCell: CrosswordPosition | null = null;
  elapsedSeconds = 0;
  completed = false;
  solvedAt: string | null = null;
  revealed = false;
  savedTimestamp: string | null = null;
  savedGameTopic: string | null = null;
  savedGameSavedAt: string | null = null;
  showSavedGameCard = true;
  hasUnsavedChanges = false;
  feedbackChoice: boolean | null = null;
  feedbackSubmitting = false;
  feedbackError = '';
  viewingEndedPuzzle = false;
  showIncorrectCompletionPopup = false;
  letterCheckCount = 0;
  wordCheckCount = 0;
  puzzleCheckCount = 0;
  letterRevealCount = 0;
  wordRevealCount = 0;
  puzzleRevealCount = 0;
  private hasShownIncorrectCompletionPopup = false;
  auth0Id = '';
  private currentPlayId = '';
  private currentDailyGame: DailyGameMeta | null = null;
  shareUrl = '';
  shareExpiresAt: string | null = null;
  shareLoading = false;
  shareCopied = false;
  shareRateLimitedUntil = 0;
  private shareSnapshot: CrosswordGameData | null = null;
  private shareRateLimitTimeout: ReturnType<typeof window.setTimeout> | null = null;
  private isSharedGame = false;
  private sessionInteracted = false;
  private sessionFinalized = false;

  wrongCellKeys = new Set<string>();
  checkedCorrectCellKeys = new Set<string>();
  checkedCorrectClueIds = new Set<string>();
  checkedIncorrectClueIds = new Set<string>();

  private clueLookup = new Map<string, CrosswordClue>();
  private timerHandle: ReturnType<typeof window.setInterval> | null = null;
  private readonly saveStorageKey = 'promptle_crossword_saved_game';

  constructor(
    public auth: AuthenticationService,
    private crosswordGameService: CrosswordGameService,
    private http: HttpClient,
    private gameFeedbackService: GameFeedbackService,
    private customGameSessionService: CustomGameSessionService,
    private router: Router,
    private route: ActivatedRoute,
    private sharedGameService: SharedGameService,
    private recommendationsService: RecommendationsService,
    protected settings: SettingsService,
    private billingService: BillingService,
    private snackbar: AppSnackbarService,
  ) {}

  ngOnInit(): void {
    this.loadDevSettings();

    this.auth.user$.subscribe((user) => {
      this.isDevAccount = user?.email === 'promptle99@gmail.com';
      this.auth0Id = user?.sub ?? '';
      if (this.auth0Id) {
        this.loadRecommendations();
        this.billingService.getStatus(this.auth0Id).subscribe(s => {
          this.hasAIAccess = s?.hasAccess ?? false;
        });
      } else {
        this.recommendations = [];
        this.hasAIAccess = false;
      }
    });

    this.refreshSavedGameMetadata();

    this.route.queryParamMap.subscribe((params) => {
      const sharedGameCode = params.get('share')?.trim();
      if (!sharedGameCode) return;
      this.loadSharedGame(sharedGameCode);
    });
  }

  ngOnDestroy(): void {
    // If the player leaves a custom crossword mid-solve after typing, count it as abandonment.
    this.finalizeCurrentSession('abandoned', { keepalive: true });
    this.stopTimer();
    this.clearShareRateLimitCooldown();
  }

  hasAIAccess = false;
  upgradeNoticeVisible = true;

  get canUseAI(): boolean {
    return !!this.auth0Id;
  }

  get aiInputDisabled(): boolean { return !this.hasAIAccess; }

  login() { this.auth.login(); }
  onUpgradeDismissed() { this.upgradeNoticeVisible = false; }
  onLockedInputClick() { if (!this.hasAIAccess) this.upgradeNoticeVisible = true; }

  get topicIdeas(): RecommendationItem[] {
    return this.recommendations.filter((item) => item.type === 'custom').slice(0, 3);
  }

  get showTopicIdeas(): boolean {
    return this.canUseAI && !!this.auth0Id && this.isTopicFocused && this.topicIdeas.length > 0 && !this.loading;
  }

  get hasPuzzle(): boolean {
    return !!this.activePuzzle;
  }

  get showGameLayout(): boolean {
    return this.loading || this.hasPuzzle;
  }

  get showSavedGamePrompt(): boolean {
    return this.showTopicPrompt && this.showSavedGameCard && !!this.savedGameTopic;
  }

  get activeAccent(): string {
    return this.activePuzzle?.accent ?? '#14b8a6';
  }

  // The active clue is derived from the focused cell plus the current solving direction.
  get activeClue(): CrosswordClue | null {
    if (!this.activePuzzle || !this.activeCell) return null;

    const cell = this.activePuzzle.cells[this.activeCell.row]?.[this.activeCell.col];
    if (!cell) return null;

    const clueId = this.activeDirection === 'across' ? cell.acrossClueId : cell.downClueId;
    return clueId ? this.clueLookup.get(clueId) ?? null : null;
  }

  get filledCellCount(): number {
    if (!this.activePuzzle) return 0;

    return this.activePuzzle.cells.flat().reduce((count, cell) => {
      if (!cell) return count;
      return this.guesses[cell.row]?.[cell.col] ? count + 1 : count;
    }, 0);
  }

  get solvedClueCount(): number {
    if (!this.activePuzzle) return 0;
    return this.activePuzzle.clues.all.filter((clue) => this.isClueSolved(clue)).length;
  }

  get solvedAtLabel(): string | null {
    return this.solvedAt ? new Date(this.solvedAt).toLocaleString() : null;
  }

  get totalFillableCells(): number {
    return this.activePuzzle?.totalFillableCells ?? 0;
  }

  get totalClueCount(): number {
    return this.activePuzzle?.clues.all.length ?? 0;
  }

  get statusLabel(): string {
    if (this.revealed) return 'Revealed';
    if (this.completed) return 'Solved';
    if (this.savedTimestamp && !this.hasUnsavedChanges) return 'Saved';
    return 'Unsaved';
  }

  get statusIcon(): string {
    if (this.revealed) return 'visibility';
    if (this.completed) return 'task_alt';
    if (this.savedTimestamp && !this.hasUnsavedChanges) return 'save';
    return 'edit';
  }

  get showGameFeedback(): boolean {
    return this.completed && !!this.activeGame;
  }

  get showEndPopup(): boolean {
    return this.completed && !!this.activeGame && !this.viewingEndedPuzzle;
  }

  get endPopupAccent(): 'success' | 'revealed' {
    return this.revealed ? 'revealed' : 'success';
  }

  get endPopupTitle(): string {
    return this.revealed ? 'Puzzle Revealed' : 'Victory!';
  }

  get endPopupSummary(): string {
    const topicName = this.activeGame?.topic || this.topic;
    return this.revealed
      ? `${topicName} is fully revealed.`
      : `You solved the ${topicName} crossword.`;
  }

  get endPopupDetail(): string {
    return this.revealed
      ? 'You can review the filled grid and try a new or the same topic when ready!'
      : 'Challenge a friend to try and beat you or play again!.';
  }

  get endPopupStats(): GameEndPopupStat[] {
    return [
      { icon: 'timer', label: this.formatTime(this.elapsedSeconds) },
      { icon: 'check_circle', label: `${this.letterCheckCount} character checks` },
      { icon: 'spellcheck', label: `${this.wordCheckCount} word checks` },
      { icon: 'rule', label: `${this.puzzleCheckCount} puzzle checks` },
      { icon: 'visibility', label: `${this.letterRevealCount} character reveals` },
      { icon: 'preview', label: `${this.wordRevealCount} word reveals` },
      { icon: 'visibility_off', label: `${this.puzzleRevealCount} puzzle reveals` },
    ];
  }

  get shareText(): string {
    if (!this.shareUrl) return '';

    const topicName = (this.activeGame?.topic || this.topic).trim() || 'Crossword';
    const status = this.revealed ? 'Revealed' : 'Solved';
    const lines = [
      `Crossword: ${topicName}`,
      `${status} · ${this.formatTime(this.elapsedSeconds)}`,
      `${this.totalClueCount} clues`,
      `${this.letterCheckCount} character checks · ${this.wordCheckCount} word checks · ${this.puzzleCheckCount} puzzle checks`,
      `${this.letterRevealCount} character reveals · ${this.wordRevealCount} word reveals · ${this.puzzleRevealCount} puzzle reveals`,
    ];
    lines.push('', 'Play this same puzzle:', this.shareUrl);
    return lines.join('\n');
  }

  get canUseShareButton(): boolean {
    if (this.shareLoading) return false;
    if (this.shareUrl) return true;
    if (this.isShareRateLimited()) return false;
    if (!this.activeGame) return false;
    if (!this.auth0Id) return true;
    return !!this.shareSnapshot;
  }

  get canShowShareButton(): boolean {
    return !!this.activeGame;
  }

  generateGame(): void {
    const normalizedTopic = this.topic.trim();
    if (!normalizedTopic || this.loading || !this.canUseAI) return;

    this.clearShareQueryParam();
    this.loading = true;
    this.error = '';
    this.feedback = 'Generating your crossword...';
    this.feedbackTone = 'neutral';
    this.showTopicPrompt = false;
    this.clearActivePuzzleState();

    this.auth.user$.pipe(take(1)).subscribe((user) => {
      this.crosswordGameService.generateGame(normalizedTopic, user?.sub || '').subscribe({
        next: (game) => {
          try {
            this.activateGame(game);
            this.feedback = `Crossword ready: ${game.topic}`;
            this.feedbackTone = 'success';
            this.loading = false;
          } catch {
            this.loading = false;
            this.currentDailyGame = null;
            this.error = CROSSWORD_GENERATION_ERROR;
            this.feedback = 'Try a different topic or try again.';
            this.feedbackTone = 'danger';
            this.showTopicPrompt = true;
          }
        },
        error: (err) => {
          this.loading = false;
          this.currentDailyGame = null;
          this.error = err?.error?.error ?? CROSSWORD_GENERATION_ERROR;
          this.feedback = 'Try a different topic or try again.';
          this.feedbackTone = 'danger';
          this.showTopicPrompt = true;
        },
      });
    });
  }

  onTopicFocus(): void {
    this.isTopicFocused = true;
  }

  onTopicBlur(): void {
    window.setTimeout(() => {
      this.isTopicFocused = false;
    }, 120);
  }

  startRecommendedTopic(item: RecommendationItem): void {
    this.topic = item.topic;
    this.generateGame();
  }

  playDailyGame(): void {
    if (this.loading || (!this.dailyGameSummary?.available && !this.currentDailyGame)) return;

    this.clearShareQueryParam();
    this.loading = true;
    this.error = '';
    this.feedback = 'Loading today\'s crossword...';
    this.feedbackTone = 'neutral';
    this.showTopicPrompt = false;
    this.clearActivePuzzleState();

    this.crosswordGameService.fetchDailyGame().subscribe({
      next: (game) => {
        try {
          this.activateGame(game);
          this.feedback = `Daily crossword ready: ${game.topic}`;
          this.feedbackTone = 'success';
          this.loading = false;
        } catch {
          this.loading = false;
          this.currentDailyGame = null;
          this.error = CROSSWORD_GENERATION_ERROR;
          this.feedback = 'Try again later or generate a different topic.';
          this.feedbackTone = 'danger';
          this.showTopicPrompt = true;
        }
      },
      error: (err) => {
        this.loading = false;
        this.currentDailyGame = null;
        this.error = err?.error?.error ?? 'Today\'s crossword is not available yet.';
        this.feedback = 'Try again later or generate a different topic.';
        this.feedbackTone = 'danger';
        this.showTopicPrompt = true;
      },
    });
  }

  copyShareLink(): void {
    if (!this.auth0Id) {
      this.feedback = 'Sign in to share this puzzle.';
      this.feedbackTone = 'neutral';
      this.snackbar.show({ message: 'Sign in to share this puzzle.', tone: 'warning', icon: 'login' });
      return;
    }

    if (this.shareUrl) {
      this.copyShareUrl();
      return;
    }

    if (this.isShareRateLimited()) {
      this.notifyShareRateLimit();
      return;
    }

    if (!this.canUseShareButton) return;

    this.createShareLinkAndCopy();
  }

  private copyShareUrl(): void {
    navigator.clipboard.writeText(this.shareUrl).then(() => {
      this.shareCopied = true;
      this.snackbar.success('Share link copied.');
      setTimeout(() => {
        this.shareCopied = false;
      }, 2500);
    }).catch(() => {
      this.snackbar.error('Could not copy share link.');
    });
  }

  continueSavedGame(): void {
    const savedState = this.readSavedGameState();
    if (!savedState?.game) {
      this.refreshSavedGameMetadata();
      return;
    }

    try {
      this.clearShareQueryParam();
      this.activateGame(savedState.game, savedState);
      this.feedback = this.revealed ? 'Saved crossword restored. Revealed puzzle ready to review.' : 'Saved crossword restored.';
      this.feedbackTone = 'success';
      this.showTopicPrompt = false;
    } catch {
      this.removeSavedGame();
      this.error = 'Saved crossword could not be restored.';
      this.feedback = 'Start a new crossword topic.';
      this.feedbackTone = 'danger';
      this.snackbar.error('Saved crossword could not be restored.');
    }
  }

  restartSavedGame(): void {
    const savedState = this.readSavedGameState();
    if (!savedState?.game) {
      this.refreshSavedGameMetadata();
      return;
    }

    this.removeSavedGame(false);
    this.clearShareQueryParam();
    this.activateGame(savedState.game, undefined, { trackSession: false });
    this.feedback = 'Crossword restarted.';
    this.feedbackTone = 'success';
    this.showTopicPrompt = false;
    this.snackbar.show({ message: 'Saved crossword restarted.', tone: 'success', icon: 'restart_alt' });
  }

  deleteSavedGameConfirm(): void {
    this.removeSavedGame();
    this.snackbar.show({ message: 'Saved crossword deleted.', tone: 'success', icon: 'delete' });
  }

  requestNewTopic(): void {
    const hadPuzzle = this.hasPuzzle;

    this.finalizeCurrentSession('abandoned', { keepalive: true });
    this.clearShareQueryParam();
    this.loading = false;
    this.error = '';
    this.topic = '';
    this.feedback = 'Enter a topic and generate a crossword.';
    this.feedbackTone = 'neutral';
    this.showTopicPrompt = true;
    this.showSavedGameCard = true;
    this.clearActivePuzzleState();
    this.refreshSavedGameMetadata();
    if (hadPuzzle) {
      this.snackbar.show({ message: 'Current crossword cleared.', tone: 'success', icon: 'edit' });
    }
  }

  submitGameFeedback(liked: boolean): void {
    if (!this.showGameFeedback || this.feedbackSubmitting || this.feedbackChoice !== null || !this.activeGame) return;

    this.feedbackSubmitting = true;
    this.feedbackError = '';

    this.auth.user$.pipe(take(1)).subscribe((user) => {
      this.gameFeedbackService.submitFeedback({
        auth0Id: user?.sub || '',
        topic: this.activeGame?.topic || this.topic,
        liked,
        gameType: 'crossword',
        result: this.revealed ? 'revealed' : 'won',
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

  saveGame(): void {
    if (!this.activePuzzle || !this.activeGame) return;

    // Save the exact play state, including check/reveal markings, so the board restores consistently.
    const payload: SavedCrosswordState = {
      savedAt: Date.now(),
      game: this.activeGame,
      guesses: this.guesses.map((row) => [...row]),
      elapsedSeconds: this.elapsedSeconds,
      completed: this.completed,
      solvedAt: this.solvedAt,
      revealed: this.revealed,
      activeDirection: this.activeDirection,
      activeCell: this.activeCell ? { ...this.activeCell } : null,
      wrongCellKeys: [...this.wrongCellKeys],
      checkedCorrectCellKeys: [...this.checkedCorrectCellKeys],
      checkedCorrectClueIds: [...this.checkedCorrectClueIds],
      checkedIncorrectClueIds: [...this.checkedIncorrectClueIds],
      letterCheckCount: this.letterCheckCount,
      wordCheckCount: this.wordCheckCount,
      puzzleCheckCount: this.puzzleCheckCount,
      letterRevealCount: this.letterRevealCount,
      wordRevealCount: this.wordRevealCount,
      puzzleRevealCount: this.puzzleRevealCount,
    };

    try {
      localStorage.setItem(this.saveStorageKey, JSON.stringify(payload));
      this.savedTimestamp = new Date(payload.savedAt).toLocaleString();
      this.hasUnsavedChanges = false;
      this.feedback = 'Crossword saved.';
      this.feedbackTone = 'success';
      this.refreshSavedGameMetadata();
      this.snackbar.success('Crossword saved.');
    } catch {
      this.error = 'Failed to save crossword.';
      this.feedback = 'Could not save the crossword.';
      this.feedbackTone = 'danger';
      this.snackbar.error('Failed to save crossword.');
    }
  }

  resetPuzzle(): void {
    if (!this.activePuzzle || !this.activeGame) return;

    if (!this.activeGame) return;

    this.activateGame(this.activeGame, undefined, { trackSession: false });
    this.feedback = 'Grid reset. Start solving again.';
    this.feedbackTone = 'neutral';
    this.snackbar.show({ message: 'Crossword grid reset.', tone: 'success', icon: 'refresh' });
  }

  toggleDirection(): void {
    const nextDirection: CrosswordDirection = this.activeDirection === 'across' ? 'down' : 'across';

    if (!this.activePuzzle) return;

    if (!this.activeCell) {
      const firstPlayable = this.findFirstPlayableCell(this.activePuzzle);
      if (!firstPlayable) return;
      this.activeDirection = nextDirection;
      this.setActiveCell(firstPlayable.row, firstPlayable.col, true);
      return;
    }

    const cell = this.activePuzzle.cells[this.activeCell.row]?.[this.activeCell.col];
    if (!cell) return;

    const nextClueId = nextDirection === 'across' ? cell.acrossClueId : cell.downClueId;
    if (!nextClueId) return;

    this.activeDirection = nextDirection;
    this.setActiveCell(this.activeCell.row, this.activeCell.col, true);
  }

  selectClue(clue: CrosswordClue): void {
    this.activeDirection = clue.direction;
    const targetCell = clue.cells.find((cell) => !this.guesses[cell.row]?.[cell.col]) ?? clue.cells[0];
    this.setActiveCell(targetCell.row, targetCell.col, true);
  }

  clearActiveClue(): void {
    if (this.completed) return;

    const clue = this.activeClue;
    if (!clue) return;

    this.markSessionInteracted();
    for (const cell of clue.cells) {
      this.setGuess(cell.row, cell.col, '');
    }

    this.feedback = `${clue.number} ${this.formatDirection(clue.direction)} cleared.`;
    this.feedbackTone = 'neutral';
    this.focusCell(clue.cells[0].row, clue.cells[0].col, true);
  }

  checkActiveLetter(): void {
    if (!this.activePuzzle || !this.activeCell) return;

    const cell = this.activePuzzle.cells[this.activeCell.row]?.[this.activeCell.col];
    if (!cell) return;

    const guess = this.guesses[cell.row]?.[cell.col];
    if (!guess) {
      this.feedback = 'Fill the active character before checking it.';
      this.feedbackTone = 'neutral';
      return;
    }

    this.letterCheckCount += 1;

    const key = this.getCellKey(cell.row, cell.col);
    this.wrongCellKeys.delete(key);
    this.checkedCorrectCellKeys.delete(key);

    if (guess === cell.solution) {
      this.checkedCorrectCellKeys.add(key);
      this.feedback = 'That character is correct.';
      this.feedbackTone = 'success';
      this.maybeCompletePuzzle();
    } else {
      this.wrongCellKeys.add(key);
      this.feedback = 'That character is incorrect.';
      this.feedbackTone = 'danger';
    }

    this.markDirty();
  }

  checkActiveClue(): void {
    if (!this.activePuzzle) return;

    const clue = this.activeClue;
    if (!clue) return;

    const missingCell = clue.cells.find((cell) => !this.guesses[cell.row]?.[cell.col]);
    if (missingCell) {
      this.feedback = 'Fill the whole word before checking it.';
      this.feedbackTone = 'neutral';
      this.setActiveCell(missingCell.row, missingCell.col, true);
      return;
    }

    this.wordCheckCount += 1;

    const summary = this.summarizeClue(clue);
    this.applyWordCheckResult(clue, summary);

    if (summary.wrongCells.length === 0) {
      this.feedback = `${clue.number} ${this.formatDirection(clue.direction)} is correct.`;
      this.feedbackTone = 'success';
      this.maybeCompletePuzzle();
    } else {
      this.feedback =
        summary.wrongCells.length === 1
          ? '1 character needs a second look.'
          : `${summary.wrongCells.length} characters need a second look.`;
      this.feedbackTone = 'danger';
      this.setActiveCell(summary.wrongCells[0].row, summary.wrongCells[0].col, true);
    }

    this.markDirty();
  }

  checkPuzzle(): void {
    if (!this.activePuzzle) return;

    this.puzzleCheckCount += 1;

    // Rebuild the checked state from scratch so clue and cell highlights stay in sync.
    const correctCellKeys = new Set<string>();
    const wrongCellKeys = new Set<string>();
    const correctClueIds = new Set<string>();
    const wrongClueIds = new Set<string>();

    for (const clue of this.activePuzzle.clues.all) {
      const summary = this.summarizeClue(clue);
      summary.correctFilledCells.forEach((cell) => correctCellKeys.add(this.getCellKey(cell.row, cell.col)));
      summary.wrongCells.forEach((cell) => wrongCellKeys.add(this.getCellKey(cell.row, cell.col)));

      if (summary.wrongCells.length > 0) {
        wrongClueIds.add(clue.id);
      } else if (summary.allFilled) {
        correctClueIds.add(clue.id);
      }
    }

    this.checkedCorrectCellKeys = correctCellKeys;
    this.wrongCellKeys = wrongCellKeys;
    this.checkedCorrectClueIds = correctClueIds;
    this.checkedIncorrectClueIds = wrongClueIds;

    if (wrongCellKeys.size === 0) {
      if (this.filledCellCount === this.totalFillableCells) {
        this.maybeCompletePuzzle();
      } else {
        this.feedback = `No issues so far. ${this.filledCellCount}/${this.totalFillableCells} characters filled.`;
        this.feedbackTone = 'success';
      }
    } else {
      const [firstWrongKey] = wrongCellKeys;
      const [row, col] = firstWrongKey.split(':').map((value) => Number(value));
      this.feedback =
        wrongCellKeys.size === 1 ? '1 character is off right now.' : `${wrongCellKeys.size} characters need attention.`;
      this.feedbackTone = 'danger';
      this.setActiveCell(row, col, true);
    }

    this.markDirty();
  }

  revealActiveCell(): void {
    if (!this.activePuzzle || !this.activeCell || this.completed) return;

    const cell = this.activePuzzle.cells[this.activeCell.row]?.[this.activeCell.col];
    if (!cell) return;

    this.letterRevealCount += 1;
    this.setGuess(cell.row, cell.col, cell.solution);
    this.checkedCorrectCellKeys.add(this.getCellKey(cell.row, cell.col));
    this.feedback = 'Character revealed.';
    this.feedbackTone = 'success';
    this.snackbar.show({ message: 'Character revealed.', tone: 'success', icon: 'visibility' });
    this.markDirty();
    this.maybeCompletePuzzle();
  }

  revealActiveClue(): void {
    if (!this.activePuzzle || this.completed) return;

    const clue = this.activeClue;
    if (!clue) return;

    this.wordRevealCount += 1;
    for (const cell of clue.cells) {
      const solution = this.activePuzzle.cells[cell.row]?.[cell.col]?.solution ?? '';
      this.setGuess(cell.row, cell.col, solution);
      this.checkedCorrectCellKeys.add(this.getCellKey(cell.row, cell.col));
    }

    this.checkedIncorrectClueIds.delete(clue.id);
    this.checkedCorrectClueIds.add(clue.id);
    this.feedback = `${clue.number} ${this.formatDirection(clue.direction)} revealed.`;
    this.feedbackTone = 'success';
    this.snackbar.show({ message: `${clue.number} ${this.formatDirection(clue.direction)} revealed.`, tone: 'success', icon: 'preview' });
    this.markDirty();
    this.maybeCompletePuzzle();
  }

  revealPuzzle(): void {
    if (!this.activePuzzle || this.completed) return;

    if (!this.activePuzzle || this.completed) return;

    this.puzzleRevealCount += 1;
    // Treat a full reveal like a terminal state: fill everything, mark it reviewed, and stop the timer.
    this.wrongCellKeys.clear();
    this.checkedCorrectCellKeys.clear();
    this.checkedCorrectClueIds.clear();
    this.checkedIncorrectClueIds.clear();

    for (const cell of this.activePuzzle.cells.flat()) {
      if (!cell) continue;
      this.setGuess(cell.row, cell.col, cell.solution);
      this.checkedCorrectCellKeys.add(this.getCellKey(cell.row, cell.col));
    }

    for (const clue of this.activePuzzle.clues.all) {
      this.checkedCorrectClueIds.add(clue.id);
    }

    this.completed = true;
    this.revealed = true;
    this.solvedAt = null;
    this.feedback = `${this.activePuzzle.topic} revealed.`;
    this.feedbackTone = 'success';
    this.snackbar.show({ message: 'Crossword revealed.', tone: 'success', icon: 'visibility' });
    this.viewingEndedPuzzle = false;
    this.stopTimer();
    this.markDirty();
  }

  onCellFocus(row: number, col: number): void {
    this.setActiveCell(row, col, false);
  }

  onCellClick(row: number, col: number): void {
    if (this.activeCell && this.activeCell.row === row && this.activeCell.col === col) {
      this.toggleDirection();
      return;
    }

    this.setActiveCell(row, col, true);
  }

  onCellInput(event: Event, row: number, col: number): void {
    if (!this.activePuzzle || this.completed) return;

    const input = event.target as HTMLInputElement;
    const character = sanitizeCrosswordCellValue(input.value);
    input.value = character;

    this.markSessionInteracted();

    if (!character) {
      this.setGuess(row, col, '');
      return;
    }

    const clue = this.resolveClueAtCell(row, col, this.activeDirection);
    this.setGuess(row, col, character);
    this.maybeCompletePuzzle();
    if (!clue) return;

    const startIndex = clue.cells.findIndex((cell) => cell.row === row && cell.col === col);
    if (startIndex < 0) return;

    const nextCell = clue.cells[Math.min(startIndex + 1, clue.cells.length - 1)];
    if (nextCell.row === row && nextCell.col === col) {
      this.focusCell(row, col, true);
      return;
    }

    this.setActiveCell(nextCell.row, nextCell.col, true);
  }

  onCellKeydown(event: KeyboardEvent, row: number, col: number): void {
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault();
        this.moveToAdjacentCell(row, col, 0, -1, 'across');
        return;
      case 'ArrowRight':
        event.preventDefault();
        this.moveToAdjacentCell(row, col, 0, 1, 'across');
        return;
      case 'ArrowUp':
        event.preventDefault();
        this.moveToAdjacentCell(row, col, -1, 0, 'down');
        return;
      case 'ArrowDown':
        event.preventDefault();
        this.moveToAdjacentCell(row, col, 1, 0, 'down');
        return;
      case 'Backspace':
        event.preventDefault();
        this.handleBackspace(row, col);
        return;
      case 'Delete':
        event.preventDefault();
        this.markSessionInteracted();
        this.setGuess(row, col, '');
        return;
      case 'Enter':
      case ' ':
        event.preventDefault();
        this.toggleDirection();
        return;
      default:
        if (event.key.length === 1 && !/[a-zA-Z0-9]/.test(event.key)) {
          event.preventDefault();
        }
    }
  }

  isActiveCell(row: number, col: number): boolean {
    return this.activeCell?.row === row && this.activeCell?.col === col;
  }

  isInActiveClue(row: number, col: number): boolean {
    const clue = this.activeClue;
    return !!clue?.cells.some((cell) => cell.row === row && cell.col === col);
  }

  isWrongCell(row: number, col: number): boolean {
    return this.wrongCellKeys.has(this.getCellKey(row, col));
  }

  isCellCheckedCorrect(row: number, col: number): boolean {
    const key = this.getCellKey(row, col);
    return this.checkedCorrectCellKeys.has(key);
  }

  isClueSolved(clue: CrosswordClue): boolean {
    if (!this.activePuzzle) return false;
    return clue.cells.every((cell) => this.guesses[cell.row]?.[cell.col] === this.activePuzzle?.cells[cell.row][cell.col]?.solution);
  }

  isClueCheckedCorrect(clue: CrosswordClue): boolean {
    return this.checkedCorrectClueIds.has(clue.id);
  }

  isClueCheckedWrong(clue: CrosswordClue): boolean {
    return this.checkedIncorrectClueIds.has(clue.id);
  }

  getClueFillCount(clue: CrosswordClue): number {
    return clue.cells.reduce((count, cell) => count + (this.guesses[cell.row]?.[cell.col] ? 1 : 0), 0);
  }

  getClueButtonLabel(clue: CrosswordClue): string {
    return `${clue.number} ${this.formatDirection(clue.direction)}: ${clue.clue}`;
  }

  getCellAriaLabel(row: number, col: number): string {
    const clue = this.resolveClueAtCell(row, col, this.activeDirection) ?? this.activeClue;
    const guess = this.guesses[row]?.[col] || 'blank';
    return clue
      ? `Row ${row + 1}, column ${col + 1}, ${clue.number} ${this.formatDirection(clue.direction)}, current value ${guess}`
      : `Row ${row + 1}, column ${col + 1}, current value ${guess}`;
  }

  formatTime(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  trackClue(_index: number, clue: CrosswordClue): string {
    return clue.id;
  }

  // Use the same daily summary shown elsewhere so the crossword CTA and generation gate stay aligned.
  private loadDevSettings(): void {
    this.http.get<{ allowAllAIGeneration?: boolean; dailyGames?: { crossword?: { topic?: string; date?: string; available?: boolean } } }>('/api/dev-settings').subscribe({
      next: (data) => {
        this.allowAllAIGeneration = data.allowAllAIGeneration ?? false;
        this.dailyGameSummary = data.dailyGames?.crossword ?? null;
      },
      error: () => {
        this.allowAllAIGeneration = false;
        this.dailyGameSummary = null;
      },
    });
  }

  private loadRecommendations(): void {
    const auth0Id = this.auth0Id.trim();
    if (!auth0Id) {
      this.recommendations = [];
      return;
    }

    this.recommendationsService.getRecommendations(auth0Id).subscribe({
      next: ({ items }) => {
        this.recommendations = items ?? [];
      },
      error: () => {
        this.recommendations = [];
      },
    });
  }

  private refreshSavedGameMetadata(): void {
    const savedState = this.readSavedGameState();
    this.savedGameTopic = savedState?.game?.topic ?? null;
    this.savedGameSavedAt = savedState?.savedAt ? new Date(savedState.savedAt).toLocaleString() : null;
    this.showSavedGameCard = !!savedState?.game;
  }

  private readSavedGameState(): SavedCrosswordState | null {
    try {
      const raw = localStorage.getItem(this.saveStorageKey);
      return raw ? (JSON.parse(raw) as SavedCrosswordState) : null;
    } catch {
      return null;
    }
  }

  private removeSavedGame(showFeedback = true): void {
    try {
      localStorage.removeItem(this.saveStorageKey);
    } catch {
      // Ignore storage failures.
    }

    this.savedGameTopic = null;
    this.savedGameSavedAt = null;
    this.showSavedGameCard = false;
    this.savedTimestamp = null;
    if (this.activePuzzle) {
      this.hasUnsavedChanges = true;
    }
    if (showFeedback) {
      this.feedback = 'Saved crossword deleted.';
      this.feedbackTone = 'neutral';
    }
  }

  private activateGame(
    game: CrosswordGameData,
    savedState?: SavedCrosswordState,
    options: { trackSession?: boolean; isShared?: boolean } = {}
  ): void {
    const puzzle = createCrosswordPuzzleFromGame(game);
    const guesses = this.coerceSavedGuesses(puzzle, savedState?.guesses);
    const completed = this.isPuzzleCompleteWithGuesses(puzzle, guesses) || !!savedState?.completed;

    // Rehydrate all runtime-only structures from the saved snapshot plus the rebuilt puzzle model.
    this.activeGame = game;
    this.currentDailyGame = game.dailyGame ?? null;
    this.isSharedGame = !!options.isShared;
    this.shareSnapshot = this.cloneSharedSnapshot(game);
    this.activePuzzle = puzzle;
    this.topic = game.topic;
    this.guesses = guesses;
    this.elapsedSeconds = Number.isFinite(savedState?.elapsedSeconds) ? savedState?.elapsedSeconds ?? 0 : 0;
    this.completed = completed;
    this.revealed = !!savedState?.revealed;
    this.solvedAt = completed ? savedState?.solvedAt ?? null : null;
    this.viewingEndedPuzzle = false;
    this.showIncorrectCompletionPopup = false;
    this.hasShownIncorrectCompletionPopup = false;
    this.letterCheckCount = savedState?.letterCheckCount ?? 0;
    this.wordCheckCount = savedState?.wordCheckCount ?? 0;
    this.puzzleCheckCount = savedState?.puzzleCheckCount ?? 0;
    this.letterRevealCount = savedState?.letterRevealCount ?? 0;
    this.wordRevealCount = savedState?.wordRevealCount ?? 0;
    this.puzzleRevealCount = savedState?.puzzleRevealCount ?? 0;
    this.activeDirection = savedState?.activeDirection ?? 'across';
    this.activeCell = this.resolveSavedActiveCell(puzzle, savedState?.activeCell);
    this.wrongCellKeys = new Set(savedState?.wrongCellKeys ?? []);
    this.checkedCorrectCellKeys = new Set(savedState?.checkedCorrectCellKeys ?? []);
    this.checkedCorrectClueIds = new Set(savedState?.checkedCorrectClueIds ?? []);
    this.checkedIncorrectClueIds = new Set(savedState?.checkedIncorrectClueIds ?? []);
    this.savedTimestamp = savedState?.savedAt ? new Date(savedState.savedAt).toLocaleString() : null;
    this.hasUnsavedChanges = !savedState;
    this.clueLookup = new Map(puzzle.clues.all.map((clue) => [clue.id, clue]));
    this.error = '';
    this.showTopicPrompt = false;
    this.resetGameFeedback();
    this.updateTimerState();
    if (options.trackSession !== false && !savedState) {
      // Saved-game restores and same-topic resets should not create a fresh recommendation signal.
      this.startSession(game.topic);
    }
    this.shareUrl = '';
    this.shareExpiresAt = null;
    this.shareLoading = false;
    this.shareCopied = false;
  }

  private loadSharedGame(shareCode: string): void {
    this.loading = true;
    this.error = '';
    this.feedback = 'Loading shared crossword...';
    this.feedbackTone = 'neutral';
    this.showTopicPrompt = false;
    this.clearActivePuzzleState();

    this.sharedGameService.loadSharedGame<CrosswordGameData>(shareCode, 'crossword').subscribe({
      next: (response) => {
        try {
          this.activateGame(response.payload, undefined, { isShared: true });
          this.feedback = `Shared crossword ready: ${response.payload.topic}`;
          this.feedbackTone = 'success';
          this.loading = false;
        } catch {
          this.loading = false;
          this.currentDailyGame = null;
          this.error = CROSSWORD_GENERATION_ERROR;
          this.feedback = 'Try another puzzle or generate a different topic.';
          this.feedbackTone = 'danger';
          this.showTopicPrompt = true;
        }
      },
      error: (err) => {
        this.loading = false;
        this.currentDailyGame = null;
        this.error = err?.error?.error ?? err?.error?.message ?? err?.message ?? 'Failed to load the shared crossword.';
        this.feedback = 'Try another puzzle or generate a different topic.';
        this.feedbackTone = 'danger';
        this.showTopicPrompt = true;
      },
    });
  }

  private resolveSavedActiveCell(puzzle: CrosswordPuzzle, savedCell: CrosswordPosition | null | undefined): CrosswordPosition | null {
    if (savedCell && puzzle.cells[savedCell.row]?.[savedCell.col]) {
      return { ...savedCell };
    }
    return this.findFirstPlayableCell(puzzle);
  }

  private coerceSavedGuesses(puzzle: CrosswordPuzzle, savedGuesses: string[][] | undefined): string[][] {
    return createEmptyCrosswordGuesses(puzzle).map((row, rowIndex) =>
      row.map((_value, colIndex) => {
        const rawValue = savedGuesses?.[rowIndex]?.[colIndex] ?? '';
        return sanitizeCrosswordCellValue(rawValue);
      })
    );
  }

  private clearActivePuzzleState(): void {
    this.stopTimer();
    this.activePuzzle = null;
    this.activeGame = null;
    this.currentDailyGame = null;
    this.guesses = [];
    this.activeDirection = 'across';
    this.activeCell = null;
    this.elapsedSeconds = 0;
    this.completed = false;
    this.revealed = false;
    this.solvedAt = null;
    this.viewingEndedPuzzle = false;
    this.showIncorrectCompletionPopup = false;
    this.hasShownIncorrectCompletionPopup = false;
    this.letterCheckCount = 0;
    this.wordCheckCount = 0;
    this.puzzleCheckCount = 0;
    this.letterRevealCount = 0;
    this.wordRevealCount = 0;
    this.puzzleRevealCount = 0;
    this.savedTimestamp = null;
    this.hasUnsavedChanges = false;
    this.wrongCellKeys.clear();
    this.checkedCorrectCellKeys.clear();
    this.checkedCorrectClueIds.clear();
    this.checkedIncorrectClueIds.clear();
    this.clueLookup.clear();
    this.resetGameFeedback();
    this.resetShareState();
    this.resetSessionState();
  }

  private resetShareState(): void {
    this.clearShareRateLimitCooldown();
    this.shareUrl = '';
    this.shareExpiresAt = null;
    this.shareLoading = false;
    this.shareCopied = false;
    this.shareSnapshot = null;
    this.isSharedGame = false;
  }

  private createShareLink(): void {
    if (!this.auth0Id || !this.shareSnapshot) {
      this.shareUrl = '';
      this.shareExpiresAt = null;
      this.shareLoading = false;
      this.shareCopied = false;
      return;
    }

    this.shareLoading = true;
    this.shareCopied = false;
    this.sharedGameService.createSharedGame('crossword', this.shareSnapshot, this.auth0Id).subscribe({
      next: (response) => {
        this.shareUrl = this.sharedGameService.buildSharedGameUrl('crossword', response.shareCode);
        this.shareExpiresAt = response.expiresAt;
        this.shareLoading = false;
      },
      error: (error: HttpErrorResponse) => {
        this.shareUrl = '';
        this.shareExpiresAt = null;
        this.shareLoading = false;
        if (this.handleShareRateLimit(error)) return;
      },
    });
  }

  private createShareLinkAndCopy(): void {
    if (!this.auth0Id || !this.shareSnapshot) return;

    this.shareLoading = true;
    this.shareCopied = false;
    this.sharedGameService.createSharedGame('crossword', this.shareSnapshot, this.auth0Id).subscribe({
      next: (response) => {
        this.shareUrl = this.sharedGameService.buildSharedGameUrl('crossword', response.shareCode);
        this.shareExpiresAt = response.expiresAt;
        this.shareLoading = false;
        this.copyShareUrl();
      },
      error: (error: HttpErrorResponse) => {
        this.shareUrl = '';
        this.shareExpiresAt = null;
        this.shareLoading = false;
        if (this.handleShareRateLimit(error)) return;
      },
    });
  }

  private handleShareRateLimit(error: HttpErrorResponse): boolean {
    if (error.status !== 429) return false;

    const retryAfterSeconds = Number.parseInt(error.headers?.get('Retry-After') || '', 10);
    const cooldownMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 60_000;
    this.setShareRateLimitCooldown(cooldownMs);
    this.notifyShareRateLimit();
    return true;
  }

  private notifyShareRateLimit(): void {
    const message = `Please wait ${this.getShareRateLimitSecondsRemaining()}s before sharing again.`;
    this.feedback = message;
    this.feedbackTone = 'neutral';
    this.snackbar.show({ message, tone: 'warning', icon: 'schedule' });
  }

  private isShareRateLimited(): boolean {
    return this.shareRateLimitedUntil > Date.now();
  }

  private getShareRateLimitSecondsRemaining(): number {
    return Math.max(1, Math.ceil((this.shareRateLimitedUntil - Date.now()) / 1000));
  }

  private setShareRateLimitCooldown(durationMs: number): void {
    this.clearShareRateLimitCooldown();
    this.shareRateLimitedUntil = Date.now() + durationMs;
    this.shareRateLimitTimeout = window.setTimeout(() => {
      this.shareRateLimitedUntil = 0;
      this.shareRateLimitTimeout = null;
    }, durationMs);
  }

  private clearShareRateLimitCooldown(): void {
    if (this.shareRateLimitTimeout) {
      clearTimeout(this.shareRateLimitTimeout);
      this.shareRateLimitTimeout = null;
    }
    this.shareRateLimitedUntil = 0;
  }

  private cloneSharedSnapshot(game: CrosswordGameData): CrosswordGameData {
    return JSON.parse(JSON.stringify(game)) as CrosswordGameData;
  }

  private clearShareQueryParam(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { share: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private isPuzzleCompleteWithGuesses(puzzle: CrosswordPuzzle, guesses: string[][]): boolean {
    return puzzle.cells.flat().every((cell) => {
      if (!cell) return true;
      return guesses[cell.row]?.[cell.col] === cell.solution;
    });
  }

  private maybeCompletePuzzle(): void {
    if (!this.activePuzzle || this.completed) return;
    if (!this.isPuzzleCompleteWithGuesses(this.activePuzzle, this.guesses)) return;

    this.completed = true;
    this.revealed = false;
    this.solvedAt = new Date().toISOString();
    this.feedback = `${this.activePuzzle.topic} complete.`;
    this.feedbackTone = 'success';
    this.viewingEndedPuzzle = false;
    this.stopTimer();
    // Only genuine solves are positive recommendation signals; reveal remains neutral.
    this.finalizeCurrentSession('completed');
  }

  returnHome(): void {
    this.loading = false;
    this.error = '';
    this.topic = '';
    this.feedback = 'Enter a topic and generate a crossword.';
    this.feedbackTone = 'neutral';
    this.showTopicPrompt = true;
    this.showSavedGameCard = true;
    this.clearActivePuzzleState();
    this.refreshSavedGameMetadata();
    this.router.navigate(['/crossword']);
  }

  playAgain(): void {
    const replayTopic = (this.activeGame?.topic || this.topic).trim();
    if (!replayTopic) return;

    this.viewingEndedPuzzle = false;
    this.topic = replayTopic;
    if (this.isSharedGame && this.shareSnapshot) {
      this.activateGame(this.cloneSharedSnapshot(this.shareSnapshot), undefined, { isShared: true });
      return;
    }
    if (this.currentDailyGame) {
      this.playDailyGame();
      return;
    }

    this.generateGame();
  }

  viewCompletedPuzzle(): void {
    this.viewingEndedPuzzle = true;
  }

  dismissIncorrectCompletionPopup(): void {
    this.showIncorrectCompletionPopup = false;
  }

  private updateTimerState(): void {
    if (this.completed || !this.activePuzzle) {
      this.stopTimer();
      return;
    }

    if (this.timerHandle) return;
    this.timerHandle = window.setInterval(() => {
      this.elapsedSeconds += 1;
    }, 1000);
  }

  private stopTimer(): void {
    if (!this.timerHandle) return;
    window.clearInterval(this.timerHandle);
    this.timerHandle = null;
  }

  private resolveClueAtCell(row: number, col: number, direction: CrosswordDirection): CrosswordClue | null {
    const cell = this.activePuzzle?.cells[row]?.[col];
    if (!cell) return null;

    const clueId = direction === 'across' ? cell.acrossClueId : cell.downClueId;
    return clueId ? this.clueLookup.get(clueId) ?? null : null;
  }

  private findFirstPlayableCell(puzzle: CrosswordPuzzle): CrosswordPosition | null {
    for (const cell of puzzle.cells.flat()) {
      if (cell) return { row: cell.row, col: cell.col };
    }
    return null;
  }

  private setActiveCell(row: number, col: number, shouldFocus: boolean): void {
    const cell = this.activePuzzle?.cells[row]?.[col];
    if (!cell) return;

    const preferredClue = this.resolveClueAtCell(row, col, this.activeDirection);
    if (!preferredClue) {
      const fallbackDirection: CrosswordDirection = this.activeDirection === 'across' ? 'down' : 'across';
      if (this.resolveClueAtCell(row, col, fallbackDirection)) {
        this.activeDirection = fallbackDirection;
      }
    }

    this.activeCell = { row, col };

    if (shouldFocus) {
      this.focusCell(row, col, true);
    }
  }

  private focusCell(row: number, col: number, selectText: boolean): void {
    window.requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>(`[data-crossword-cell="${row}-${col}"]`);
      if (!input) return;
      input.focus();
      if (selectText) {
        input.select();
      }
    });
  }

  private moveToAdjacentCell(
    row: number,
    col: number,
    rowDelta: number,
    colDelta: number,
    direction: CrosswordDirection
  ): void {
    if (!this.activePuzzle) return;

    let nextRow = row + rowDelta;
    let nextCol = col + colDelta;

    // Arrow navigation skips empty squares so sparse layouts still feel like a crossword.
    while (
      nextRow >= 0 &&
      nextRow < this.activePuzzle.size &&
      nextCol >= 0 &&
      nextCol < this.activePuzzle.size
    ) {
      if (this.activePuzzle.cells[nextRow][nextCol]) {
        this.activeDirection = direction;
        this.setActiveCell(nextRow, nextCol, true);
        return;
      }
      nextRow += rowDelta;
      nextCol += colDelta;
    }
  }

  private handleBackspace(row: number, col: number): void {
    if (this.completed) return;

    if (this.guesses[row]?.[col]) {
      this.markSessionInteracted();
      this.setGuess(row, col, '');
      return;
    }

    const clue = this.resolveClueAtCell(row, col, this.activeDirection);
    if (!clue) return;

    const cellIndex = clue.cells.findIndex((cell) => cell.row === row && cell.col === col);
    if (cellIndex <= 0) return;

    const previousCell = clue.cells[cellIndex - 1];
    this.markSessionInteracted();
    this.setGuess(previousCell.row, previousCell.col, '');
    this.setActiveCell(previousCell.row, previousCell.col, true);
  }

  private summarizeClue(clue: CrosswordClue): ClueCheckSummary {
    const wrongCells: CrosswordPosition[] = [];
    const correctFilledCells: CrosswordPosition[] = [];
    let allFilled = true;

    for (const cell of clue.cells) {
      const guess = this.guesses[cell.row]?.[cell.col];
      const solution = this.activePuzzle?.cells[cell.row]?.[cell.col]?.solution;

      if (!guess) {
        allFilled = false;
        continue;
      }

      if (guess === solution) {
        correctFilledCells.push(cell);
      } else {
        wrongCells.push(cell);
      }
    }

    return {
      allFilled,
      wrongCells,
      correctFilledCells,
    };
  }

  private applyWordCheckResult(clue: CrosswordClue, summary: ClueCheckSummary): void {
    for (const cell of clue.cells) {
      const key = this.getCellKey(cell.row, cell.col);
      this.wrongCellKeys.delete(key);
      this.checkedCorrectCellKeys.delete(key);
    }

    summary.correctFilledCells.forEach((cell) => this.checkedCorrectCellKeys.add(this.getCellKey(cell.row, cell.col)));
    summary.wrongCells.forEach((cell) => this.wrongCellKeys.add(this.getCellKey(cell.row, cell.col)));

    if (summary.wrongCells.length === 0) {
      this.checkedIncorrectClueIds.delete(clue.id);
      this.checkedCorrectClueIds.add(clue.id);
      return;
    }

    this.checkedCorrectClueIds.delete(clue.id);
    this.checkedIncorrectClueIds.add(clue.id);
  }

  private setGuess(row: number, col: number, value: string): void {
    const cell = this.activePuzzle?.cells[row]?.[col];
    if (!cell) return;

    this.clearValidationForCell(row, col);
    this.guesses[row][col] = sanitizeCrosswordCellValue(value);
    this.markDirty();
    this.syncIncorrectCompletionPopup();
  }

  private clearValidationForCell(row: number, col: number): void {
    const key = this.getCellKey(row, col);
    this.wrongCellKeys.delete(key);
    this.checkedCorrectCellKeys.delete(key);

    const cell = this.activePuzzle?.cells[row]?.[col];
    if (!cell) return;

    // Editing one square can invalidate both intersecting clues, so clear their checked state together.
    if (cell.acrossClueId) {
      this.checkedCorrectClueIds.delete(cell.acrossClueId);
      this.checkedIncorrectClueIds.delete(cell.acrossClueId);
    }

    if (cell.downClueId) {
      this.checkedCorrectClueIds.delete(cell.downClueId);
      this.checkedIncorrectClueIds.delete(cell.downClueId);
    }
  }

  private markDirty(): void {
    if (!this.activePuzzle) return;
    this.hasUnsavedChanges = true;
  }

  private syncIncorrectCompletionPopup(): void {
    if (!this.activePuzzle || this.completed || this.revealed) {
      this.showIncorrectCompletionPopup = false;
      this.hasShownIncorrectCompletionPopup = false;
      return;
    }

    const isFilled = this.filledCellCount === this.totalFillableCells;
    if (!isFilled) {
      this.showIncorrectCompletionPopup = false;
      this.hasShownIncorrectCompletionPopup = false;
      return;
    }

    if (this.isPuzzleCompleteWithGuesses(this.activePuzzle, this.guesses)) {
      this.showIncorrectCompletionPopup = false;
      return;
    }

    if (!this.hasShownIncorrectCompletionPopup) {
      this.showIncorrectCompletionPopup = true;
      this.hasShownIncorrectCompletionPopup = true;
    }
  }

  private formatDirection(direction: CrosswordDirection): string {
    return direction === 'across' ? 'Across' : 'Down';
  }

  private getCellKey(row: number, col: number): string {
    return `${row}:${col}`;
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
    if (this.currentDailyGame) {
      this.resetSessionState();
      return;
    }

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
      gameType: 'crossword',
    }).subscribe({
      error: () => {
        this.resetSessionState();
      },
    });
  }

  // Record the first meaningful move so we can identify a session as abandoned only if the user played at all.
  private markSessionInteracted(): void {
    const auth0Id = this.auth0Id.trim();
    if (!auth0Id || !this.currentPlayId || this.sessionInteracted || this.completed) return;

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
    if (finalState === 'abandoned' && (!this.sessionInteracted || this.completed)) return;

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
}
