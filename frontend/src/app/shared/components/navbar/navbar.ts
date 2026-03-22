import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
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
import { Router } from '@angular/router';
import { AuthenticationService } from '../../../services/authentication.service';
import { ProfileService } from '../../../services/profile.service';
import { take } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, MatToolbarModule, MatButtonModule, MatIconModule, MatMenuModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrls: ['./navbar.css']
})
export class NavbarComponent implements OnInit {
  isLoggedIn = false;
  isDarkTheme = false;
  dbUsername = '';
  dbProfilePic = '';
  showMenu = false;
  private readonly themeStorageKey = 'promptle-theme';

  constructor(public auth: AuthenticationService, private http: HttpClient, public router: Router) {}

  ngOnInit() {
    this.initializeTheme();
    this.auth.isAuthenticated$.subscribe(status => this.isLoggedIn = status);
    this.auth.user$.subscribe(user => {
      if (user?.sub) {
        this.http.get(`/api/profile/${user.sub}`)
          .subscribe((data: any) => {
            this.dbUsername = data?.username;
            this.dbProfilePic = data?.profilePic;
          });
      }
    });
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    this.applyTheme(this.isDarkTheme);
    localStorage.setItem(this.themeStorageKey, this.isDarkTheme ? 'dark' : 'light');
  }

  private initializeTheme(): void {
    const savedTheme = localStorage.getItem(this.themeStorageKey);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    this.isDarkTheme = savedTheme ? savedTheme === 'dark' : prefersDark;
    this.applyTheme(this.isDarkTheme);
  }

  private applyTheme(isDark: boolean): void {
    document.body.classList.toggle('dark', isDark);
  }

  toggleLogin() {
    if (this.isLoggedIn) {
      this.auth.logout();
    } else {
      this.auth.login();
    }
  }

  fetchNavbarProfile(auth0Id: string) {
    this.http.get(`/api/profile/${auth0Id}`)
      .subscribe({
        next: (data: any) => {
          if (data) {
            this.dbUsername = data.username;
            this.dbProfilePic = data.profilePic;
          }
        },
        error: (err) => console.error("Navbar fetch error:", err)
      });
  }
}