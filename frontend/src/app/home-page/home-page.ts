import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopicsListService, TopicInfo } from '../services/topics-list';
import { Router } from '@angular/router';

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
  allTopics: TopicInfo[] = [];   // this should be an array of TopicInfo
  selectedTopic: TopicInfo | null = null;


  constructor(private topicsService: TopicsListService, private router: Router) {}

  ngOnInit() {
    this.getTopics();
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
        id: this.selectedTopic.topicId,
        name: this.selectedTopic.topicName
      }
    });
  }

}

