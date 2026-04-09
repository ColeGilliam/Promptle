import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { AuthenticationService } from '../../services/authentication.service';
import { ProfileService } from '../../services/profile.service';
import { take } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
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
  dbUsername: string = '';
  dbProfilePic: string = '';
  selectedImageBase64: string = '';
  winCount = 0;

  constructor(private http: HttpClient, private auth: AuthenticationService, private profile: ProfileService) {}

  ngOnInit() {
    this.auth.isAuthenticated$.subscribe((status) => {
      this.isLoggedIn = status;
    });

    this.auth.user$.subscribe((user) => {
      if (user) {
        this.registerUser(user);
      }
      if (!user?.sub) {
        this.dbUsername = '';
        this.dbProfilePic = '';
        this.winCount = 0;
        return;
      }

      this.fetchMongoProfile(user.sub);
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
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }

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
        const nextProfilePic = this.selectedImageBase64 || this.dbProfilePic;
        const payload = {
          auth0Id: user.sub,
          username: this.dbUsername,
          profilePic: nextProfilePic
        };
        this.profile.updateProfile(payload)
          .subscribe({
            next: () => {
              alert('Profile updated!');
              this.dbProfilePic = nextProfilePic;
              this.selectedImageBase64 = '';
              this.auth.setMongoUser({
                username: this.dbUsername,
                profilePic: this.dbProfilePic
              });
            },
            error: (err) => console.error(err)
          });
      }
    });
  }

  private fetchMongoProfile(auth0Id: string) {
    this.profile.getProfile(auth0Id)
      .subscribe({
        next: (mongoUser: any) => {
          if (mongoUser) {
            this.dbUsername = mongoUser.username || '';
            this.dbProfilePic = mongoUser.profilePic || '';
            this.winCount = mongoUser.wins || 0;
          }
        },
        error: (err: any) => {
          console.error("Error fetching custom profile:", err);
        }
      });
  }
}
