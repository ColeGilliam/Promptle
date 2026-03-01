import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'app-bottom-header',
  standalone: true,
  imports: [MatCardModule],
  templateUrl: './bottom-header.html',
  styleUrl: './bottom-header.css',
})
export class BottomHeaderComponent {}
