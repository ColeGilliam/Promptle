import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopicsListService, TopicInfo } from '../../services/topics-list';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authentication.service';
import { HttpClient } from '@angular/common/http';  // ← added for POST

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
  allTopics: TopicInfo[] = [];
  selectedTopic: TopicInfo | null = null;
  customTopic = '';

  isMultiplayer = false;  // ← controls mode (false = single, true = multiplayer)

  // FAKE LOG IN STATE FOR UI (you can keep or remove)
  isLoggedIn = false;
  displayName = 'future username display';

  constructor(
    private topicsService: TopicsListService,
    private router: Router,
    private auth: AuthenticationService,
    private http: HttpClient  // ← added
  ) {}

  ngOnInit() {
    this.getTopics();

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

  // TOGGLES FAKE LOG IN STATE (keep if you want)
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
      },
      error: (err) => console.error(err)
    });
  }

  // ────────────────────────────────────────────────
  // Called when toggle changes
  // ────────────────────────────────────────────────
  onModeChange(isSingleplayer: boolean) {
    this.isMultiplayer = !isSingleplayer;
    console.log('Mode changed to:', this.isMultiplayer ? 'Multiplayer' : 'Singleplayer');
  }

  // ────────────────────────────────────────────────
  // Shared method — decides single vs multiplayer
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
      this.http.post<{ roomId: string }>('http://localhost:3001/api/game/multiplayer', payload)
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
      // SINGLE PLAYER: your original navigation
      const queryParams = isAi ? { topic: payload.topic } : { id: payload.id };
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

  joinChatRoom() {
    this.router.navigate(['/chat']);
  }
}