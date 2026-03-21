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
  private mySocketId = '';

  private roomStateSubject = new BehaviorSubject<RoomState | null>(null);
  public roomState$: Observable<RoomState | null> = this.roomStateSubject.asObservable();

  // Callback arrays so listeners survive across Observable subscriptions
  private opponentGuessCallbacks: ((data: any) => void)[] = [];
  private playerWonCallbacks:     ((data: any) => void)[] = [];
  private gameStartedCallbacks:   ((data: any) => void)[] = [];
  private hostStatusCallbacks:    ((data: any) => void)[] = [];

  constructor() {}

  joinRoom(roomId: string, playerName: string = 'Guest') {
    console.log(`[Service] Attempting to join room ${roomId} as ${playerName}`);

    if (this.socket?.connected) {
      console.log('[Service] Socket already connected → emitting join-room');
      this.socket.emit('join-room', { roomId, playerName });
      return;
    }

    console.log('[Service] Creating new socket connection');

    this.socket = io({
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5
    });

    this.socket.on('connect', () => {
      this.mySocketId = this.socket!.id!;
      console.log(`[Service] ✅ CONNECTED! Socket ID: ${this.mySocketId}`);
      this.socket!.emit('join-room', { roomId, playerName });

      // Register all game-event listeners after socket is connected
      this.socket!.on('opponent-guess', (data) => {
        console.log('[Service] opponent-guess received:', data);
        this.opponentGuessCallbacks.forEach(cb => cb(data));
      });

      this.socket!.on('player-won', (data) => {
        console.log('[Service] player-won received:', data);
        this.playerWonCallbacks.forEach(cb => cb(data));
      });

      this.socket!.on('game-started', () => {
        console.log('[Service] game-started received');
        this.gameStartedCallbacks.forEach(cb => cb({}));
      });

      this.socket!.on('host-status', (data: { isHost: boolean }) => {
        console.log('[Service] host-status received:', data);
        this.hostStatusCallbacks.forEach(cb => cb(data));
      });
    });

    this.socket.on('reconnect', () => {
      this.mySocketId = this.socket!.id!;
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

    this.socket.on('connect_error', (err) => {
      console.error('[Service] ❌ Connection error:', err.message);
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
    this.opponentGuessCallbacks = [];
    this.playerWonCallbacks     = [];
    this.gameStartedCallbacks   = [];
    this.hostStatusCallbacks    = [];
  }

  /** Host-only: tell all players in the room to start the game. */
  startGame(roomId: string) {
    console.log('[Service] Emitting start-game for room:', roomId);
    this.socket?.emit('start-game', { roomId });
  }

  emitGuess(
    roomId: string,
    playerName: string,
    colors: string[],
    isCorrect: boolean,
    finishTimeMs?: number
  ) {
    console.log('[Service] Emitting player-guess:', { roomId, playerName, colors, isCorrect, finishTimeMs });
    this.socket?.emit('player-guess', {
      roomId,
      playerName,
      playerId: this.mySocketId,
      colors,
      isCorrect,
      finishTime: finishTimeMs
    });
  }

  onOpponentGuess(): Observable<{
    playerName: string;
    colors: string[];
    isCorrect: boolean;
    playerId: string;
    finishTime?: number;
  }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.opponentGuessCallbacks.push(cb);
      return () => {
        this.opponentGuessCallbacks = this.opponentGuessCallbacks.filter(c => c !== cb);
      };
    });
  }

  onPlayerWon(): Observable<{
    playerName: string;
    playerId: string;
    guesses: number;
    finishTime?: number;
  }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.playerWonCallbacks.push(cb);
      return () => {
        this.playerWonCallbacks = this.playerWonCallbacks.filter(c => c !== cb);
      };
    });
  }

  onGameStarted(): Observable<void> {
    return new Observable(observer => {
      const cb = () => observer.next();
      this.gameStartedCallbacks.push(cb);
      return () => {
        this.gameStartedCallbacks = this.gameStartedCallbacks.filter(c => c !== cb);
      };
    });
  }

  onHostStatus(): Observable<{ isHost: boolean }> {
    return new Observable(observer => {
      const cb = (data: { isHost: boolean }) => observer.next(data);
      this.hostStatusCallbacks.push(cb);
      return () => {
        this.hostStatusCallbacks = this.hostStatusCallbacks.filter(c => c !== cb);
      };
    });
  }

  getSocketId(): string {
    return this.mySocketId || this.socket?.id || '';
  }
}
