import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Promptle } from "./pages/promptle/promptle";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, Promptle],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('Promptle');
}
