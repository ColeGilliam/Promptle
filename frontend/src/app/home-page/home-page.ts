import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatMenuModule } from '@angular/material/menu';
import { NavbarComponent } from '../shared/components/navbar/navbar';
import { UniFooterComponent } from '../shared/ui/uni-footer/uni-footer';

@Component({
  selector: 'app-home-page-legacy',
  standalone: true,
  imports: [
    RouterModule,
    NavbarComponent,
    MatCardModule,
    MatButtonModule,
    MatMenuModule,
    UniFooterComponent
  ],
  templateUrl: './home-page.html',
  styleUrls: ['./home-page.css']
})
export class HomePageLegacyComponent {}
