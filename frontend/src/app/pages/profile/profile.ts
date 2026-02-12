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
import { ProfileService } from '../../services/profile.service';
import { take } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

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
    MatIconModule,
    FormsModule
  ],
  templateUrl: './profile.html',
  styleUrls: ['./profile.css'],
})
export class ProfileComponent implements OnInit {

    isLoggedIn = false;
    dbUsername: string = '';
    dbProfilePic: string = '';
    selectedImageBase64: string = ''; 
    loading: boolean = true;
    winCount = 0;
    constructor(private router: Router, private http: HttpClient, private auth: AuthenticationService, private profile: ProfileService) {}

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
      if (user?.sub) {
        this.fetchMongoProfile(user.sub);
        this.profile.getProfile(user.sub).subscribe({
          next: (mongoUser) => {
            this.dbUsername = mongoUser.username || '';
            this.dbProfilePic = mongoUser.profilePic || '';
            this.loading = false;
          }
        });
      }
    });
  }

  registerUser(user: any) {
    const payload = {
        auth0Id: user.sub,
        email: user.email,
        name: user.name
    };

    this.http.post('http://localhost:3001/api/auth-user', payload).subscribe({
        next: (res) => console.log('Registration/Login Sync Success:', res),
        error: (err) => console.error('Registration/Login Sync Failed:', err)
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
    const file = event.target.files[0]; // Get the selected file
    
    if (file) {
      // Check if the file is an image
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file.');
        return;
      }

      const reader = new FileReader();
      
      // This runs once the file is finished being read
      reader.onload = () => {
        // This is the long string that represents the image
        this.selectedImageBase64 = reader.result as string; 
      };

      // Start reading the file as a DataURL (Base64)
      reader.readAsDataURL(file);
    }
  }

  saveProfile() {
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (user && user.sub) {
        const payload = {
          auth0Id: user.sub,
          username: this.dbUsername,
          // If selectedImageBase64 is empty, keep the old dbProfilePic
          profilePic: this.selectedImageBase64 || this.dbProfilePic 
        };
        console.log("Sending payload:", payload);
        this.http.put('http://localhost:3001/api/update-profile', payload)
          .subscribe({
            next: () => {
              alert('Profile updated!');
              this.dbProfilePic = this.selectedImageBase64;
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
  fetchMongoProfile(auth0Id: string) {
    this.http.get(`http://localhost:3001/api/profile/${auth0Id}`)
      .subscribe({
        next: (mongoUser: any) => {
          if (mongoUser) {
            this.dbUsername = mongoUser.username || '';
            this.dbProfilePic = mongoUser.profilePic || '';
            this.winCount = mongoUser.wins || 0;
          }
          this.loading = false;
        },
        error: (err: any) => {
          console.error("Error fetching custom profile:", err);
          this.loading = false;
        }
      });
  }
}