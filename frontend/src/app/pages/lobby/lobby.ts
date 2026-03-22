import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { HttpClient, HttpClientModule } from '@angular/common/http';

import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { UniFooterComponent } from '../../shared/ui/uni-footer/uni-footer';

export interface LobbyRoom {
  roomId: string;
  topic: string;
  playerCount: number;
  createdAt: string;
  source: 'ai' | 'db';
  mode: string;
}

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    HttpClientModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
    NavbarComponent,
    UniFooterComponent,
  ],
  templateUrl: './lobby.html',
  styleUrls: ['./lobby.css'],
})
export class LobbyComponent implements OnInit, AfterViewInit, OnDestroy {
  rooms: LobbyRoom[] = [];
  roomCodeInput = '';
  isLoading = true;
  errorMsg = '';
  codeError = '';
  lastRefreshed: Date | null = null;

  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private revealObserver?: IntersectionObserver;

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit() {
    this.fetchRooms();
    this.pollInterval = setInterval(() => this.fetchRooms(), 10000);
  }

  ngAfterViewInit() {
    this.setupRevealObserver();
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.revealObserver?.disconnect();
  }

  private setupRevealObserver() {
    this.revealObserver?.disconnect();
    this.revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            (entry.target as HTMLElement).classList.add('reveal--visible');
            this.revealObserver?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -30px 0px' }
    );
    document.querySelectorAll('.reveal:not(.reveal--visible)').forEach(el => {
      this.revealObserver!.observe(el);
    });
  }

  fetchRooms() {
    this.http.get<LobbyRoom[]>('/api/game/rooms').subscribe({
      next: (rooms) => {
        this.rooms = rooms;
        this.isLoading = false;
        this.errorMsg = '';
        this.lastRefreshed = new Date();
        setTimeout(() => this.setupRevealObserver(), 50);
      },
      error: () => {
        this.isLoading = false;
        this.errorMsg = 'Could not load rooms. Is the server running?';
      },
    });
  }

  joinRoom(roomId: string) {
    this.router.navigate(['/game'], { queryParams: { room: roomId } });
  }

  joinByCode() {
    const code = this.roomCodeInput.trim().toUpperCase();
    if (!code) {
      this.codeError = 'Please enter a room code.';
      return;
    }
    if (code.length !== 6) {
      this.codeError = 'Room codes are 6 characters long.';
      return;
    }
    this.codeError = '';
    this.router.navigate(['/game'], { queryParams: { room: code } });
  }

  onCodeInput() {
    if (this.codeError) this.codeError = '';
    this.roomCodeInput = this.roomCodeInput.toUpperCase();
  }

  timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }
}
