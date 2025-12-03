import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PromptleComponent } from "./pages/promptle/promptle";
import { CommonModule } from '@angular/common';
import { HomePage } from "./home-page/home-page";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, PromptleComponent, CommonModule, HomePage],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('Promptle');
}
