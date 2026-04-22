import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Router } from '@angular/router';
import { AuthenticationService } from '../../services/authentication.service';
import { take } from 'rxjs';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { FormsModule } from '@angular/forms';

import { NavbarComponent } from '../../shared/components/navbar/navbar';

@Component({
  selector: 'app-dev-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HttpClientModule,
    MatIconModule,
    MatButtonModule,
    MatSlideToggleModule,
    NavbarComponent,
  ],
  templateUrl: './dev-settings.html',
  styleUrls: ['./dev-settings.css'],
})
export class DevSettingsComponent implements OnInit {
  isDevAccount = false;
  myAuth0Id = '';
  isLoading = true;
  isSaving = false;
  saveSuccess = false;
  errorMsg = '';

  allowGuestsCreateRooms = false;
  allowAllAIGeneration = false;
  showPromptleAnswerAtTop = false;

  constructor(
    private http: HttpClient,
    private auth: AuthenticationService,
    private router: Router
  ) {}

  ngOnInit() {
    this.auth.user$.pipe(take(1)).subscribe(user => {
      if (!user || user.email !== 'promptle99@gmail.com') {
        this.router.navigate(['/']);
        return;
      }
      this.isDevAccount = true;
      this.myAuth0Id = user.sub ?? '';
      this.loadSettings();
    });
  }

  loadSettings() {
    this.isLoading = true;
    this.http.get<any>('/api/dev-settings').subscribe({
      next: (data) => {
        this.allowGuestsCreateRooms = data.allowGuestsCreateRooms ?? false;
        this.allowAllAIGeneration = data.allowAllAIGeneration ?? false;
        this.showPromptleAnswerAtTop = data.showPromptleAnswerAtTop ?? false;
        this.isLoading = false;
      },
      error: () => {
        this.errorMsg = 'Failed to load settings.';
        this.isLoading = false;
      },
    });
  }

  saveSettings() {
    this.isSaving = true;
    this.saveSuccess = false;
    this.errorMsg = '';
    this.http.put<any>('/api/dev-settings', {
      auth0Id: this.myAuth0Id,
      allowGuestsCreateRooms: this.allowGuestsCreateRooms,
      allowAllAIGeneration: this.allowAllAIGeneration,
      showPromptleAnswerAtTop: this.showPromptleAnswerAtTop,
    }).subscribe({
      next: () => {
        this.isSaving = false;
        this.saveSuccess = true;
        setTimeout(() => this.saveSuccess = false, 3000);
      },
      error: (err) => {
        this.isSaving = false;
        this.errorMsg = err?.error?.error || 'Failed to save settings.';
      },
    });
  }
}
