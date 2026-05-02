import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { RouterModule } from '@angular/router';
import { AuthenticationService } from '../../../services/authentication.service';

const DEV_EMAIL = 'promptle99@gmail.com';

@Component({
  selector: 'app-mini-footer',
  standalone: true,
  imports: [CommonModule, MatDividerModule, MatIconModule, RouterModule],
  templateUrl: './minifooter.html',
  styleUrl: './minifooter.css',
})
export class MiniFooterComponent implements OnInit {
  readonly year = new Date().getFullYear();
  isDevAccount = false;

  constructor(private auth: AuthenticationService) {}

  ngOnInit() {
    this.auth.user$.subscribe(user => {
      this.isDevAccount = user?.email === DEV_EMAIL;
    });
  }
}
