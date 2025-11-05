import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import mockData from './mock-data.json';

@Component({
  selector: 'app-promptle',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './promptle.html',
  styleUrls: ['./promptle.css']
})
export class PromptleComponent implements OnInit {
  topic = mockData.topic;
  headers = mockData.headers;
  answers = mockData.answers;
  selectedGuess: string = '';

  // 🆕 Store all submitted guesses here
  submittedGuesses: any[] = [];

  ngOnInit() {
    console.log('Loaded topic:', this.topic);
  }

  onSubmitGuess() {
    if (!this.selectedGuess) return;

    // Find the full object for the chosen character
    const guessedCharacter = this.answers.find(
      (a) => a.name === this.selectedGuess
    );

    if (guessedCharacter) {
      // Push their full row of data into the guess list
      this.submittedGuesses.push(guessedCharacter);
      console.log('Guess added:', guessedCharacter);
    }

    // Reset dropdown
    this.selectedGuess = '';
  }
}
