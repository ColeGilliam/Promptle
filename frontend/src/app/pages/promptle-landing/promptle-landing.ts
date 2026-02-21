import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { TopicsListService, TopicInfo } from '../../services/topics-list';
import { AuthenticationService } from '../../services/authentication.service';

// Angular Material modules
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { PromptleToolbarComponent } from '../../shared/promptle-toolbar/toolbar/promptle-toolbar';

@Component({
  selector: 'app-promptle-landing',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,
    MatChipsModule,
    MatButtonModule,
    PromptleToolbarComponent
  ],
  templateUrl: './promptle-landing.html',
  styleUrls: ['./promptle-landing.css'],
})
export class PromptleLandingComponent implements OnInit {
  topicNames: string[] = [];
  allTopics: TopicInfo[] = [];
  selectedTopic: TopicInfo | null = null;
  customTopic = '';

  // FAKE LOG IN STATE FOR UI
  isLoggedIn = false;
  displayName = 'future username display';

  constructor(private topicsService: TopicsListService, private router: Router, private auth: AuthenticationService) {}

  ngOnInit() {
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

  startGame(){
    if(!this.selectedTopic) return;

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

}
