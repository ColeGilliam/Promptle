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
import { GameFeedbackCard } from '../../shared/ui/game-feedback-card/game-feedback-card';
import { CustomGameSessionService } from '../../services/custom-game-session';

type FeedbackTone = 'neutral' | 'success' | 'danger';
const CROSSWORD_GENERATION_ERROR = 'Sorry! The puzzle failed to generate. Please try again.';
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
    GameFeedbackCard,
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
  private auth0Id = '';
  private currentPlayId = '';
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
    private auth: AuthenticationService,
    private crosswordGameService: CrosswordGameService,
    private http: HttpClient,
    private gameFeedbackService: GameFeedbackService,
    private customGameSessionService: CustomGameSessionService
  ) {}

  ngOnInit(): void {
    this.loadDevSettings();

    this.auth.user$.subscribe((user) => {
      this.isDevAccount = user?.email === 'promptle99@gmail.com';
      this.auth0Id = user?.sub ?? '';
    });

    this.refreshSavedGameMetadata();
  }

  ngOnDestroy(): void {
    // If the player leaves a custom crossword mid-solve after typing, count it as abandonment.
    this.finalizeCurrentSession('abandoned', { keepalive: true });
    this.stopTimer();
  }

  get canUseAI(): boolean {
    return this.isDevAccount || this.allowAllAIGeneration;
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

  generateGame(): void {
    const normalizedTopic = this.topic.trim();
    if (!normalizedTopic || this.loading || !this.canUseAI) return;

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
            this.error = CROSSWORD_GENERATION_ERROR;
            this.feedback = 'Try a different topic or try again.';
            this.feedbackTone = 'danger';
            this.showTopicPrompt = true;
          }
        },
        error: (err) => {
          this.loading = false;
          this.error = err?.error?.code === 'topic_not_allowed'
            ? (err?.error?.error ?? 'This topic is not allowed.')
            : CROSSWORD_GENERATION_ERROR;
          this.feedback = 'Try a different topic or try again.';
          this.feedbackTone = 'danger';
          this.showTopicPrompt = true;
        },
      });
    });
  }

  continueSavedGame(): void {
    const savedState = this.readSavedGameState();
    if (!savedState?.game) {
      this.refreshSavedGameMetadata();
      return;
    }

    try {
      this.activateGame(savedState.game, savedState);
      this.feedback = this.revealed ? 'Saved crossword restored. Revealed puzzle ready to review.' : 'Saved crossword restored.';
      this.feedbackTone = 'success';
      this.showTopicPrompt = false;
    } catch {
      this.removeSavedGame();
      this.error = 'Saved crossword could not be restored.';
      this.feedback = 'Start a new crossword topic.';
      this.feedbackTone = 'danger';
    }
  }

  restartSavedGame(): void {
    const savedState = this.readSavedGameState();
    if (!savedState?.game) {
      this.refreshSavedGameMetadata();
      return;
    }

    const confirmed = window.confirm(`Restart "${savedState.game.topic}" from the beginning? Your saved progress will be removed.`);
    if (!confirmed) return;

    this.removeSavedGame(false);
    this.activateGame(savedState.game, undefined, { trackSession: false });
    this.feedback = 'Crossword restarted.';
    this.feedbackTone = 'success';
    this.showTopicPrompt = false;
  }

  deleteSavedGameConfirm(): void {
    const confirmed = window.confirm('Delete saved crossword? This cannot be undone.');
    if (!confirmed) return;
    this.removeSavedGame();
  }

  requestNewTopic(): void {
    const confirmed = !this.hasPuzzle || window.confirm('Start a new topic? Your current crossword progress will be cleared.');
    if (!confirmed) return;

    this.finalizeCurrentSession('abandoned', { keepalive: true });
    this.loading = false;
    this.error = '';
    this.topic = '';
    this.feedback = 'Enter a topic and generate a crossword.';
    this.feedbackTone = 'neutral';
    this.showTopicPrompt = true;
    this.showSavedGameCard = true;
    this.clearActivePuzzleState();
    this.refreshSavedGameMetadata();
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
    };

    try {
      localStorage.setItem(this.saveStorageKey, JSON.stringify(payload));
      this.savedTimestamp = new Date(payload.savedAt).toLocaleString();
      this.hasUnsavedChanges = false;
      this.feedback = 'Crossword saved.';
      this.feedbackTone = 'success';
      this.refreshSavedGameMetadata();
    } catch {
      this.error = 'Failed to save crossword.';
      this.feedback = 'Could not save the crossword.';
      this.feedbackTone = 'danger';
    }
  }

  resetPuzzle(): void {
    if (!this.activePuzzle || !this.activeGame) return;

    const confirmed = window.confirm(`Reset "${this.activePuzzle.topic}"? All entered cells will be cleared.`);
    if (!confirmed) return;

    this.activateGame(this.activeGame, undefined, { trackSession: false });
    this.feedback = 'Grid reset. Start solving again.';
    this.feedbackTone = 'neutral';
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
      this.feedback = 'Fill the active cell before checking it.';
      this.feedbackTone = 'neutral';
      return;
    }

    const key = this.getCellKey(cell.row, cell.col);
    this.wrongCellKeys.delete(key);
    this.checkedCorrectCellKeys.delete(key);

    if (guess === cell.solution) {
      this.checkedCorrectCellKeys.add(key);
      this.feedback = 'That cell is correct.';
      this.feedbackTone = 'success';
      this.maybeCompletePuzzle();
    } else {
      this.wrongCellKeys.add(key);
      this.feedback = 'That cell is incorrect.';
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
      this.feedback = 'Fill every cell in the active word before checking it.';
      this.feedbackTone = 'neutral';
      this.setActiveCell(missingCell.row, missingCell.col, true);
      return;
    }

    const summary = this.summarizeClue(clue);
    this.applyWordCheckResult(clue, summary);

    if (summary.wrongCells.length === 0) {
      this.feedback = `${clue.number} ${this.formatDirection(clue.direction)} is correct.`;
      this.feedbackTone = 'success';
      this.maybeCompletePuzzle();
    } else {
      this.feedback =
        summary.wrongCells.length === 1
          ? '1 cell needs a second look.'
          : `${summary.wrongCells.length} cells need a second look.`;
      this.feedbackTone = 'danger';
      this.setActiveCell(summary.wrongCells[0].row, summary.wrongCells[0].col, true);
    }

    this.markDirty();
  }

  checkPuzzle(): void {
    if (!this.activePuzzle) return;

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
        this.feedback = `No issues so far. ${this.filledCellCount}/${this.totalFillableCells} cells filled.`;
        this.feedbackTone = 'success';
      }
    } else {
      const [firstWrongKey] = wrongCellKeys;
      const [row, col] = firstWrongKey.split(':').map((value) => Number(value));
      this.feedback =
        wrongCellKeys.size === 1 ? '1 cell is off right now.' : `${wrongCellKeys.size} cells need attention.`;
      this.feedbackTone = 'danger';
      this.setActiveCell(row, col, true);
    }

    this.markDirty();
  }

  revealActiveCell(): void {
    if (!this.activePuzzle || !this.activeCell || this.completed) return;

    const cell = this.activePuzzle.cells[this.activeCell.row]?.[this.activeCell.col];
    if (!cell) return;

    this.setGuess(cell.row, cell.col, cell.solution);
    this.checkedCorrectCellKeys.add(this.getCellKey(cell.row, cell.col));
    this.feedback = 'Cell revealed.';
    this.feedbackTone = 'success';
    this.markDirty();
    this.maybeCompletePuzzle();
  }

  revealActiveClue(): void {
    if (!this.activePuzzle || this.completed) return;

    const clue = this.activeClue;
    if (!clue) return;

    for (const cell of clue.cells) {
      const solution = this.activePuzzle.cells[cell.row]?.[cell.col]?.solution ?? '';
      this.setGuess(cell.row, cell.col, solution);
      this.checkedCorrectCellKeys.add(this.getCellKey(cell.row, cell.col));
    }

    this.checkedIncorrectClueIds.delete(clue.id);
    this.checkedCorrectClueIds.add(clue.id);
    this.feedback = `${clue.number} ${this.formatDirection(clue.direction)} revealed.`;
    this.feedbackTone = 'success';
    this.markDirty();
    this.maybeCompletePuzzle();
  }

  revealPuzzle(): void {
    if (!this.activePuzzle || this.completed) return;

    const confirmed = window.confirm('Reveal the entire crossword? This will fill every answer and end the current game.');
    if (!confirmed) return;

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
    const letters = input.value.toUpperCase().replace(NON_ALPHANUMERIC_CELL_VALUE, '');

    if (!letters) {
      this.markSessionInteracted();
      this.setGuess(row, col, '');
      return;
    }

    const clue = this.resolveClueAtCell(row, col, this.activeDirection);
    if (!clue) return;

    const startIndex = clue.cells.findIndex((cell) => cell.row === row && cell.col === col);
    if (startIndex < 0) return;

    const clueLetters = letters.split('');
    let lastWrittenIndex = startIndex;
    this.markSessionInteracted();

    clueLetters.forEach((letter, offset) => {
      const targetCell = clue.cells[startIndex + offset];
      if (!targetCell) return;
      this.setGuess(targetCell.row, targetCell.col, letter);
      lastWrittenIndex = startIndex + offset;
    });

    this.maybeCompletePuzzle();

    const nextCell = clue.cells[Math.min(lastWrittenIndex + 1, clue.cells.length - 1)];
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

  private loadDevSettings(): void {
    this.http.get<{ allowAllAIGeneration?: boolean }>('/api/dev-settings').subscribe({
      next: (data) => {
        this.allowAllAIGeneration = data.allowAllAIGeneration ?? false;
      },
      error: () => {
        this.allowAllAIGeneration = false;
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
    options: { trackSession?: boolean } = {}
  ): void {
    const puzzle = createCrosswordPuzzleFromGame(game);
    const guesses = this.coerceSavedGuesses(puzzle, savedState?.guesses);
    const completed = this.isPuzzleCompleteWithGuesses(puzzle, guesses) || !!savedState?.completed;

    // Rehydrate all runtime-only structures from the saved snapshot plus the rebuilt puzzle model.
    this.activeGame = game;
    this.activePuzzle = puzzle;
    this.topic = game.topic;
    this.guesses = guesses;
    this.elapsedSeconds = Number.isFinite(savedState?.elapsedSeconds) ? savedState?.elapsedSeconds ?? 0 : 0;
    this.completed = completed;
    this.revealed = !!savedState?.revealed;
    this.solvedAt = completed ? savedState?.solvedAt ?? null : null;
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
    this.guesses = [];
    this.activeDirection = 'across';
    this.activeCell = null;
    this.elapsedSeconds = 0;
    this.completed = false;
    this.revealed = false;
    this.solvedAt = null;
    this.savedTimestamp = null;
    this.hasUnsavedChanges = false;
    this.wrongCellKeys.clear();
    this.checkedCorrectCellKeys.clear();
    this.checkedCorrectClueIds.clear();
    this.checkedIncorrectClueIds.clear();
    this.clueLookup.clear();
    this.resetGameFeedback();
    this.resetSessionState();
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
    this.stopTimer();
    // Only genuine solves are positive recommendation signals; reveal remains neutral.
    this.finalizeCurrentSession('completed');
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
