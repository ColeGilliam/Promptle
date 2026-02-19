import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { PromptleToolbarComponent } from '../../shared/promptle-toolbar/promptle-toolbar';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatExpansionModule,
    MatButtonModule,
    MatIconModule,
    PromptleToolbarComponent
  ],
  templateUrl: './about.html',
  styleUrls: ['./about.css'],
})
export class AboutComponent {
  slides: string[] = [
    'Promptle is our CS 426 Senior Project in Computer Science (Spring 2025) at the University of Nevada, Reno, CSE Department. Team 9; Cody Shrive, Cole Gilliam, Richard Nguyen, and Jorge Cervacio Izquierdo compose the development team, with guidance from David Feil-Seifer (Instructor), Vinh Le and Richie White (Teaching Assistants), and external advisor Prof. Erin Keith.',
    'Promptle is a web game similar to Wordle but with AI implemented into it to address the limitation that Wordle games have. They are hard coded topics that come from a hard set database meaning there is only so many topics, guesses, and answers. We address this problem by implemention AI through OpenAI\'s API to dynamically create puzzles based on a topic the user inputs. Our project will have a login system with profiles, popuar topics, AI prompt generated games, and multiplayer. It will also includee a variety of other games following the idea of using AI and letting the user choose the topic to allow unlimited and unique games. ',
    'THIRD SLIDE text found in about.ts inside src/app/pages/about'
  ];

  currentIndex = 0;

  prevSlide() {
    this.currentIndex = (this.currentIndex - 1 + this.slides.length) % this.slides.length;
  }

  nextSlide() {
    this.currentIndex = (this.currentIndex + 1) % this.slides.length;
  }

  goToSlide(index: number) {
    this.currentIndex = index;
  }

}
