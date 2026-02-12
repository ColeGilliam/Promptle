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
import { AuthenticationService } from '../../services/authentication.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatExpansionModule,
    MatButtonModule,
    MatMenuModule,
    MatToolbarModule,
    MatIconModule
  ],
  templateUrl: './profile.html',
  styleUrls: ['./profile.css'],
})
export class ProfileComponent implements OnInit {

    isLoggedIn = false;
    constructor(private router: Router, private auth: AuthenticationService) {}

    ngOnInit() {
    // Subscribe to Auth0's real authentication state
    this.auth.isAuthenticated$.subscribe((status) => {
      this.isLoggedIn = status;
    });

    this.auth.user$.subscribe((user) => {
      if (user) {
        

        // Send user to backend
        this.registerUser(user);
      }
    });
  }

  registerUser(user: any) {
    fetch('http://localhost:3001/api/auth-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
          auth0Id: user.sub,
          email: user.email,
          name: user.name,
          picture: user.picture
        })
      });
  }

  // TOGGLES FAKE LOG IN STATE
  toggleLogin() {
    if (this.isLoggedIn) {
      this.auth.logout();
    } else {
      this.auth.login();
    }
  }

  deleteAccount() {
    // We take(1) so we don't stay subscribed to the user object forever
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
}