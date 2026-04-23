import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authentication.service';
import { take } from 'rxjs';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';

import { NavbarComponent } from '../../shared/components/navbar/navbar';

@Component({
  selector: 'app-dev-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    MatFormFieldModule,
    MatInputModule,
    DragDropModule,
    NavbarComponent,
  ],
  templateUrl: './dev-settings.html',
  styleUrls: ['./dev-settings.css'],
})
export class DevSettingsComponent implements OnInit {
  readonly dailyGameModes = [
    {
      key: 'promptle',
      label: 'Promptle',
      icon: 'view_column',
    },
    {
      key: 'connections',
      label: 'Connections',
      icon: 'grid_view',
    },
    {
      key: 'crossword',
      label: 'Crossword',
      icon: 'crossword',
    },
  ] as const;

  isDevAccount = false;
  myAuth0Id = '';
  isLoading = true;
  isSaving = false;
  saveSuccess = false;
  errorMsg = '';

  allowGuestsCreateRooms = false;
  allowAllAIGeneration = false;
  showPromptleAnswerAtTop = false;
  dailyGameAdmin: Record<string, {
    queue: string[];
    currentSchedule: { topic: string; date: string } | null;
    generatedAt: string | null;
    hasGeneratedGame: boolean;
  }> = {};
  dailyGameQueues: Record<string, string[]> = {
    promptle: [],
    connections: [],
    crossword: [],
  };

  constructor(
    private http: HttpClient,
    private auth: AuthenticationService,
    private router: Router
  ) {}

  ngOnInit() {
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (!user || user.email !== 'promptle99@gmail.com') {
        this.router.navigate(['/']);
        return;
      }
      this.isDevAccount = true;
      this.myAuth0Id = user.sub ?? '';
      this.loadSettings();
    });
  }

  loadSettings() {
    this.isLoading = true;
    this.http.get<any>(`/api/dev-settings?auth0Id=${encodeURIComponent(this.myAuth0Id)}`).subscribe({
      next: (data) => {
        this.allowGuestsCreateRooms = data.allowGuestsCreateRooms ?? false;
        this.allowAllAIGeneration = data.allowAllAIGeneration ?? false;
        this.showPromptleAnswerAtTop = data.showPromptleAnswerAtTop ?? false;
        this.dailyGameAdmin = data.dailyGameAdmin ?? {};
        this.hydrateDailyQueuesFromAdmin();
        this.isLoading = false;
      },
      error: () => {
        this.errorMsg = 'Failed to load settings.';
        this.isLoading = false;
      },
    });
  }

  saveSettings() {
    this.isSaving = true;
    this.saveSuccess = false;
    this.errorMsg = '';
    this.http.put<any>('/api/dev-settings', {
      auth0Id: this.myAuth0Id,
      allowGuestsCreateRooms: this.allowGuestsCreateRooms,
      allowAllAIGeneration: this.allowAllAIGeneration,
      showPromptleAnswerAtTop: this.showPromptleAnswerAtTop,
      dailyGameQueues: this.buildDailyGameQueuesPayload(),
    }).subscribe({
      next: (response) => {
        this.isSaving = false;
        this.saveSuccess = true;
        this.dailyGameAdmin = response?.dailyGameAdmin ?? this.dailyGameAdmin;
        this.hydrateDailyQueuesFromAdmin();
        setTimeout(() => this.saveSuccess = false, 3000);
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMsg = err?.error?.error || 'Failed to save settings.';
      },
    });
  }

  getCurrentScheduleLabel(modeKey: string): string {
    const schedule = this.dailyGameAdmin[modeKey]?.currentSchedule;
    if (!schedule?.topic) return 'Nothing scheduled';
    return `${schedule.topic} (${schedule.date})`;
  }

  getGenerationStatusLabel(modeKey: string): string {
    const state = this.dailyGameAdmin[modeKey];
    if (!state?.currentSchedule?.topic) return 'No current daily game';
    if (!state.hasGeneratedGame) return 'Not ready yet';
    if (!state.generatedAt) return 'Generated';
    return `Generated ${new Date(state.generatedAt).toLocaleString()}`;
  }

  getTopicLabel(index: number): string {
    return index === 0 ? 'Current Game' : `Queue ${index}`;
  }

  addTopic(modeKey: string): void {
    this.dailyGameQueues[modeKey] = [...(this.dailyGameQueues[modeKey] ?? []), ''];
  }

  removeTopic(modeKey: string, index: number): void {
    const nextQueue = [...(this.dailyGameQueues[modeKey] ?? [])];
    nextQueue.splice(index, 1);
    this.dailyGameQueues[modeKey] = nextQueue;
  }

  // The first item in each list is the active game, so drag order directly controls activation order.
  reorderTopics(modeKey: string, event: CdkDragDrop<string[]>): void {
    const nextQueue = [...(this.dailyGameQueues[modeKey] ?? [])];
    moveItemInArray(nextQueue, event.previousIndex, event.currentIndex);
    this.dailyGameQueues[modeKey] = nextQueue;
  }

  trackTopic(_index: number, _topic: string): number {
    return _index;
  }

  private buildDailyGameQueuesPayload(): Record<string, string[]> {
    return this.dailyGameModes.reduce<Record<string, string[]>>((accumulator, mode) => {
      accumulator[mode.key] = this.sanitizeQueue(this.dailyGameQueues[mode.key]);
      return accumulator;
    }, {});
  }

  private sanitizeQueue(value: string[] = []): string[] {
    return value
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  // Rehydrate from the backend response so the UI reflects any immediate current-game switch
  // and any queue cleanup performed server-side.
  private hydrateDailyQueuesFromAdmin(): void {
    this.dailyGameModes.forEach((mode) => {
      this.dailyGameQueues[mode.key] = [...(this.dailyGameAdmin[mode.key]?.queue ?? [])];
    });
  }
}
