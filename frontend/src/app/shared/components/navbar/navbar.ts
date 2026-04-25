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
import { MatDialog } from '@angular/material/dialog';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../../services/authentication.service';
import { ProfileService } from '../../../services/profile.service';
import { take } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { HowToPlayDialogComponent, HowToPlayMode } from './how-to-play-dialog';
import { SettingsDialogComponent } from './settings-dialog';
import { SettingsService } from '../../../services/settings.service';

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
  isDevAccount = false;
  dbUsername = '';
  dbProfilePic = '';
  showMenu = false;
  private readonly themeStorageKey = 'promptle-theme';

  public router: Router;

  constructor(
    public auth: AuthenticationService,
    private http: HttpClient,
    router?: Router,
    private dialog?: MatDialog,
    private settingsService?: SettingsService
  ) {
    this.router = router ?? ({ url: '/' } as Router);
  }

  ngOnInit() {
    this.initializeTheme();

    this.settingsService?.isDarkTheme$.subscribe((isDarkTheme) => {
      this.isDarkTheme = isDarkTheme;
    });

    this.auth.isAuthenticated$.subscribe(status => this.isLoggedIn = status);
    this.auth.user$.subscribe(user => {
      if (user?.sub) {
        this.isDevAccount = user.email === 'promptle99@gmail.com';
        this.http.get(`/api/profile/${user.sub}`)
          .subscribe((data: any) => {
            this.dbUsername = data?.username || '';
            this.dbProfilePic = data?.profilePic || '';
          });
      }
    });
  }

  get isConnectionsRoute(): boolean {
    return this.router.url.startsWith('/connections');
  }

  get isCrosswordRoute(): boolean {
    return this.router.url.startsWith('/crossword');
  }

  get isPromptleRoute(): boolean {
    return !this.isConnectionsRoute && !this.isCrosswordRoute;
  }

  openHowToPlay(): void {
    this.dialog?.open(HowToPlayDialogComponent, {
      width: '420px',
      maxWidth: '92vw',
      panelClass: 'htp-dialog-panel',
      data: { mode: this.resolveHowToPlayMode() }
    });
  }

  openSettings(): void {
    const dialogRef = this.dialog?.open(SettingsDialogComponent, {
      width: '460px',
      maxWidth: '92vw',
      panelClass: 'settings-dialog-panel'
    });

    dialogRef?.afterClosed().subscribe(() => {
      this.initializeTheme();
    });
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;

    if (this.settingsService) {
      this.settingsService.setTheme(this.isDarkTheme);
      return;
    }

    this.applyTheme(this.isDarkTheme);
    localStorage.setItem(this.themeStorageKey, this.isDarkTheme ? 'dark' : 'light');
  }

  private initializeTheme(): void {
    if (this.settingsService) {
      this.isDarkTheme = this.settingsService.isDarkTheme;
      return;
    }

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
            this.dbUsername = data.username || '';
            this.dbProfilePic = data.profilePic || '';
          }
        },
        error: (err) => console.error("Navbar fetch error:", err)
      });
  }

  private resolveHowToPlayMode(): HowToPlayMode {
    if (this.isConnectionsRoute) return 'connections';
    if (this.isCrosswordRoute) return 'crossword';
    return 'promptle';
  }
}
