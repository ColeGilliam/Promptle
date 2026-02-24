// src/app/services/multiplayer.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';  // Make sure you've installed: npm install socket.io-client

// Optional: define simple types for better TypeScript safety
interface Player {
  id: string;          // socket.id or your user ID
  name: string;        // username or display name
  guesses?: number;    // you can add this later (e.g. how many guesses they've made)
  // Add more fields as needed: score, ready, etc.
}

interface RoomState {
  roomId: string;
  players: Player[];
  // You can expand later: currentPrompt?, gameStarted, etc.
}

@Injectable({
  providedIn: 'root'  // or provide in module if you prefer scoped
})
export class MultiplayerService {

  private socket: Socket;
  private url = 'http://localhost:3000';  // ← change to your backend URL (or env variable)

  // Reactive state for the current room & players
  private roomStateSubject = new BehaviorSubject<RoomState | null>(null);
  public roomState$: Observable<RoomState | null> = this.roomStateSubject.asObservable();

  // Quick accessors (optional convenience)
  public get currentPlayers(): Player[] {
    return this.roomStateSubject.value?.players || [];
  }

  constructor() {
    // We'll connect lazily when joinRoom() is called (better than connecting on service creation)
    this.socket = io(this.url, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });
  }

  // Call this from your component's ngOnInit when you have a roomId (from URL)
  public joinRoom(roomId: string, playerName: string = 'Guest'): void {
    if (this.socket) {
      // Already connected → just join new room
      this.socket.emit('join-room', { roomId, playerName });
      return;
    }

    // First time: connect + join
    this.socket = io(this.url, {
      reconnection: true,           // auto-reconnect if dropped
      reconnectionAttempts: 5,
      transports: ['websocket'],    // prefer websocket over polling
    });

    // Listen for connection confirmation
    this.socket.on('connect', () => {
      console.log('Connected to Socket.IO server → socket ID:', this.socket.id);
      this.socket.emit('join-room', { roomId, playerName });
    });

    // Listen for errors
    this.socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });

    // Key event: server tells us the room state / player list updated
    this.socket.on('players-updated', (data: { roomId: string; players: Player[] }) => {
      console.log('Players updated in room', data.roomId, data.players);
      this.roomStateSubject.next({
        roomId: data.roomId,
        players: data.players
      });
    });

    // Optional: server confirms you joined (can show toast / "Welcome!" etc.)
    this.socket.on('joined-room', (data: { roomId: string; message?: string }) => {
      console.log('Successfully joined room:', data.roomId);
      // You could emit a toast or local event here if you want
    });

    // Later you can add more listeners, e.g.:
    // this.socket.on('guess-submitted', ...)
    // this.socket.on('game-won', ...)
  }

  // Call this when user leaves page / switches mode / etc.
  public leaveRoom(): void {
    if (this.socket) {
      this.socket.emit('leave-room');
      this.roomStateSubject.next(null);
      // Optionally disconnect if no more multiplayer needed:
      // this.socket.disconnect();
    }
  }

  // Example: sending a guess (expand later)
  public sendGuess(guess: string): void {
    if (this.socket && this.roomStateSubject.value) {
      this.socket.emit('submit-guess', {
        roomId: this.roomStateSubject.value.roomId,
        guess
      });
    }
  }

  // Cleanup (good practice — call from component ngOnDestroy if needed)
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null as any;
    }
    this.roomStateSubject.next(null);
  }
}