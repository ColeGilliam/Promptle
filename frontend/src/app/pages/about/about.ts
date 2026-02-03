import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatExpansionModule,
    MatButtonModule,
    MatMenuModule,
    MatToolbarModule,
    MatIconModule
  ],
  templateUrl: './about.html',
  styleUrls: ['./about.css'],
})
export class AboutComponent {
  slides: string[] = [
    'Promptle is our CS 426 Senior Project in Computer Science (Spring 2025) at the University of Nevada, Reno, CSE Department. Team 9; Cody Shrive, Cole Gilliam, Richard Nguyen, and Jorge Cervacio Izquierdo compose the development team, with guidance from David Feil-Seifer (Instructor), Vinh Le and Richie White (Teaching Assistants), and external advisor Prof. Erin Keith.',
    'SECOND SLIDE text found in about.ts inside src/app/pages/about',
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
