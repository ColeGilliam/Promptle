import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { NavbarComponent } from '../shared/components/navbar/navbar';

@Component({
  selector: 'app-home-page-legacy',
  standalone: true,
  imports: [
    RouterModule,
    NavbarComponent,
    MatCardModule,
    MatButtonModule
  ],
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.css']
})
export class HomePageLegacyComponent {}
