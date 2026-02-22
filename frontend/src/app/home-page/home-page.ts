import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { NavbarComponent } from '../shared/components/navbar/navbar';

@Component({
  selector: 'app-home-page-legacy',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    NavbarComponent,
    MatMenuModule,
    MatCardModule,
    MatButtonModule,
    MatDividerModule
  ],
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.css']
})
export class HomePageLegacyComponent {}
