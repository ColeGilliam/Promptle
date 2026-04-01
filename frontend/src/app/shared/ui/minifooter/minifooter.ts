import { Component } from '@angular/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-mini-footer',
  standalone: true,
  imports: [MatDividerModule, MatIconModule, RouterModule],
  templateUrl: './minifooter.html',
  styleUrl: './minifooter.css',
})
export class MiniFooterComponent {
  readonly year = new Date().getFullYear();
}
