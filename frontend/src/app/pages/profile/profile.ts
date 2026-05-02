import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { AuthenticationService } from '../../services/authentication.service';
import { ProfileService } from '../../services/profile.service';
import { BillingService, BillingStatus } from '../../services/billing.service';
import { take } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { MiniFooterComponent } from '../../shared/ui/minifooter/minifooter';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    FormsModule,
    NavbarComponent,
    MiniFooterComponent,
  ],
  templateUrl: './profile.html',
  styleUrls: ['./profile.css'],
})
export class ProfileComponent implements OnInit {
  isLoggedIn = false;
  isDarkTheme = false;
  dbUsername: string = '';
  dbProfilePic: string = '';
  selectedImageBase64: string = '';
  loading: boolean = true;
  winCount = 0;
  totalGuesses = 0;
  timedWins = 0;
  totalFinishMs = 0;
  winStreak = 0;
  bestStreak = 0;
  saveError = '';
  usernameError = '';
  profilePicError = '';
  billingStatus: BillingStatus | null = null;
  billingLoading = false;
  billingBanner: { type: 'success' | 'cancel'; message: string } | null = null;
  private readonly themeStorageKey = 'promptle-theme';

  get avgGuesses(): string {
    if (!this.winCount) return '—';
    return (this.totalGuesses / this.winCount).toFixed(1);
  }

  get avgFinishTime(): string {
    if (!this.timedWins) return '—';
    const avgMs = this.totalFinishMs / this.timedWins;
    const totalSec = Math.floor(avgMs / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  constructor(
    private http: HttpClient,
    private auth: AuthenticationService,
    private profile: ProfileService,
    private billing: BillingService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  ngOnInit() {
    const billing = this.route.snapshot.queryParamMap.get('billing');
    if (billing === 'success') {
      this.billingBanner = { type: 'success', message: 'Payment successful! Your access has been activated.' };
    } else if (billing === 'cancel') {
      this.billingBanner = { type: 'cancel', message: 'Checkout cancelled — no charge was made.' };
    }
    if (billing) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }

    this.auth.isAuthenticated$.subscribe((status) => {
      this.isLoggedIn = status;
    });

    this.auth.user$.subscribe((user) => {
      if (user) {
        this.registerUser(user);
      }
      if (!user?.sub) {
        this.dbUsername    = '';
        this.dbProfilePic  = '';
        this.winCount      = 0;
        this.totalGuesses  = 0;
        this.timedWins     = 0;
        this.totalFinishMs = 0;
        this.winStreak     = 0;
        this.bestStreak    = 0;
        return;
      }

      this.fetchMongoProfile(user.sub);
      this.fetchBillingStatus(user.sub);
    });
  }

  private registerUser(user: any) {
    const payload = {
      auth0Id: user.sub,
      email: user.email,
      name: user.name
    };

    this.http.post('/api/auth-user', payload).subscribe({
      next: (res) => console.log('Registration/Login Sync Success:', res),
      error: (err) => console.error('Registration/Login Sync Failed:', err)
    });
  }

  deleteAccount() {
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user && user.sub) {
        const confirmDelete = confirm("Are you sure? This will permanently remove your data.");
        if (confirmDelete) {
          this.auth.deleteAccount(user.sub);
        }
      } else {
        console.error("User ID not found. Are you logged in?");
      }
    });
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];

    if (file) {
      this.profilePicError = '';

      const reader = new FileReader();
      reader.onload = () => {
        this.selectedImageBase64 = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  saveProfile() {
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user && user.sub) {
        this.usernameError = '';
        this.saveError = '';
        const nextProfilePic = this.selectedImageBase64 || this.dbProfilePic;
        const payload = {
          auth0Id: user.sub,
          username: this.dbUsername,
          profilePic: nextProfilePic
        };
        this.profile.updateProfile(payload)
          .subscribe({
            next: (response) => {
              alert('Profile updated!');
              this.dbUsername = response?.username || this.dbUsername;
              this.dbProfilePic = response?.profilePic ?? (this.selectedImageBase64 || this.dbProfilePic);
              this.selectedImageBase64 = ''; 
              this.profilePicError = '';
              this.saveError = '';

              this.auth.setMongoUser({
                username: this.dbUsername,
                profilePic: this.dbProfilePic
              });
            },
            error: (err) => {
              const serverError = err?.error?.error || 'Failed to update profile.';
              const serverCode = err?.error?.code || '';
              this.saveError = serverError;
              if (String(serverCode).startsWith('profile_image')) {
                this.profilePicError = serverError;
              }
              if (
                String(serverCode).startsWith('username') ||
                String(serverCode).startsWith('profile_username')
              ) {
                this.usernameError = serverError;
              }
              console.error(err);
            }
          });
      }
    });
  }

  private fetchBillingStatus(auth0Id: string) {
    this.billingLoading = true;
    this.billing.getStatus(auth0Id).subscribe({
      next: (status) => {
        this.billingStatus = status;
        this.billingLoading = false;
      },
      error: () => { this.billingLoading = false; }
    });
  }

  get subscriptionPeriodEnd(): string {
    if (!this.billingStatus?.subscription?.currentPeriodEnd) return '';
    return new Date(this.billingStatus.subscription.currentPeriodEnd).toLocaleDateString();
  }

  subscribe(mode: 'subscription' | 'tokens') {
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (!user?.sub) return;
      this.billing.startCheckout(user.sub, mode).subscribe({
        next: ({ url }) => { window.location.href = url; },
        error: (err) => alert(err?.error?.error || 'Failed to start checkout. Please try again.'),
      });
    });
  }

  openBillingPortal() {
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (!user?.sub) return;
      this.billing.openPortal(user.sub).subscribe({
        next: ({ url }) => { window.location.href = url; },
        error: (err) => alert(err?.error?.error || 'Failed to open billing portal.'),
      });
    });
  }

  private fetchMongoProfile(auth0Id: string) {
    this.profile.getProfile(auth0Id)
      .subscribe({
        next: (mongoUser: any) => {
          if (mongoUser) {
            this.dbUsername    = mongoUser.username    || '';
            this.dbProfilePic  = mongoUser.profilePic  || '';
            this.winCount      = mongoUser.wins         || 0;
            this.totalGuesses  = mongoUser.totalGuesses  || 0;
            this.timedWins     = mongoUser.timedWins     || 0;
            this.totalFinishMs = mongoUser.totalFinishMs || 0;
            this.winStreak     = mongoUser.winStreak     || 0;
            this.bestStreak    = mongoUser.bestStreak    || 0;
          }
        },
        error: (err: any) => {
          console.error("Error fetching custom profile:", err);
        }
      });
  }
}
