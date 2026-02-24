// src/app/services/multiplayer-promptle.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { io, Socket } from 'socket.io-client';

interface Player {
  id: string;
  name: string;
  guesses?: number;
}

interface RoomState {
  roomId: string;
  players: Player[];
}

@Injectable({ providedIn: 'root' })
export class MultiplayerService {

  private socket: Socket | null = null;
  private readonly url = 'http://localhost:3001';  // confirmed correct

  private roomStateSubject = new BehaviorSubject<RoomState | null>(null);
  public roomState$: Observable<RoomState | null> = this.roomStateSubject.asObservable();

  constructor() {}

  joinRoom(roomId: string, playerName: string = 'Guest') {
    console.log(`[Service] Attempting to join room ${roomId} as ${playerName}`);

    if (this.socket?.connected) {
      console.log('[Service] Socket already connected → emitting join-room');
      this.socket.emit('join-room', { roomId, playerName });
      return;
    }

    console.log('[Service] Creating new socket connection');

    this.socket = io(this.url, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      transports: ['websocket', 'polling'],  // allow both
    });

    this.socket.on('connect', () => {
      console.log(`[Service] ✅ CONNECTED! Socket ID: ${this.socket!.id}`);
      this.socket!.emit('join-room', { roomId, playerName });
    });

    this.socket.on('connect_error', (err) => {
      console.error('[Service] ❌ Connection error:', err.message);
    });

    this.socket.on('players-updated', (data: { roomId: string; players: Player[] }) => {
      console.log('[Service] 👥 Received players-updated:', data.players);
      this.roomStateSubject.next({
        roomId: data.roomId,
        players: data.players
      });
    });

    this.socket.on('joined-room', (data) => {
      console.log('[Service] 🎉 Successfully joined room:', data.roomId);
    });

    this.socket.on('error', (err) => {
      console.error('[Service] Socket error event:', err);
    });
  }

  leaveRoom() {
    if (this.socket?.connected) {
      console.log('[Service] Emitting leave-room');
      this.socket.emit('leave-room');
    }
    this.roomStateSubject.next(null);
  }

  disconnect() {
    if (this.socket) {
      console.log('[Service] Disconnecting socket');
      this.socket.disconnect();
      this.socket = null;
    }
    this.roomStateSubject.next(null);
  }
}