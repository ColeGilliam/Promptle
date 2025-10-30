import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Promptle } from "./pages/promptle/promptle";
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Promptle, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('Promptle');
}
