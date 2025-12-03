import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopicsListService } from '../services/topics-list';

// Angular Material modules
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { FormsModule } from '@angular/forms';
import { MatButton } from '@angular/material/button';



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
    MatButton
  ],
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.css'],
})
export class HomePage implements OnInit {
  topicNames: string[] = [];
  allTopics: string[] = [];       // optional, for full dropdown
  selectedTopic: string | null = null;

  constructor(private topicsService: TopicsListService) {}

  ngOnInit() {
    this.getTopics();
  }

  getTopics() {
    this.topicsService.getTopicsList().subscribe({
      next: (data: string[]) => {
        console.log('Topics data from backend:', data);
        this.topicNames = data;
        this.allTopics = data; // if using same list for dropdown
      },
      error: (err) => console.error(err)
    });
  }
}
