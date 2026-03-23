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

  private opponentGuessCallbacks: ((data: any) => void)[] = [];
  private playerWonCallbacks:     ((data: any) => void)[] = [];
  private gameStartedCallbacks:   ((data: any) => void)[] = [];
  private hostStatusCallbacks:    ((data: any) => void)[] = [];
  private powerupEffectCallbacks: ((data: any) => void)[] = [];

  // 1v1 callbacks
  private oneVsOneStartedCallbacks:      ((data: any) => void)[] = [];
  private oneVsOneTurnChangeCallbacks:   ((data: any) => void)[] = [];
  private oneVsOneGuessMadeCallbacks:    ((data: any) => void)[] = [];
  private oneVsOneGameOverCallbacks:     ((data: any) => void)[] = [];
  private oneVsOneDisconnectedCallbacks: ((data: any) => void)[] = [];
  private joinErrorCallbacks:            ((data: any) => void)[] = [];
  private roomDeletedCallbacks:          (() => void)[] = [];

  constructor() {}

  private getDeviceId(): string {
    let id = localStorage.getItem('promptle_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
      localStorage.setItem('promptle_device_id', id);
    }
    return id;
  }

  joinRoom(roomId: string, playerName: string = 'Guest') {
    console.log(`[Service] Attempting to join room ${roomId} as ${playerName}`);
    const deviceId = this.getDeviceId();

    if (this.socket?.connected) {
      console.log('[Service] Socket already connected → emitting join-room');
      this.socket.emit('join-room', { roomId, playerName, deviceId });
      return;
    }

    console.log('[Service] Creating new socket connection');

    this.socket = io({
      path: '/socket.io/',
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionAttempts: 5
    });

    // ── Register all game-event listeners ONCE right after socket creation.
    // Keeping them outside the 'connect' handler prevents duplicate registrations
    // on reconnect, which would cause each event to fire multiple times.
    this.socket.on('opponent-guess', (data) => {
      console.log('[Service] opponent-guess received:', data);
      this.opponentGuessCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('player-won', (data) => {
      console.log('[Service] player-won received:', data);
      this.playerWonCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('game-started', () => {
      console.log('[Service] game-started received');
      this.gameStartedCallbacks.forEach(cb => cb({}));
    });

    this.socket.on('host-status', (data: { isHost: boolean }) => {
      console.log('[Service] host-status received:', data);
      this.hostStatusCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('powerup-effect', (data) => {
      console.log('[Service] powerup-effect received:', data);
      this.powerupEffectCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('1v1-started', (data) => {
      console.log('[Service] 1v1-started received:', data);
      this.oneVsOneStartedCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('1v1-turn-change', (data) => {
      console.log('[Service] 1v1-turn-change received:', data);
      this.oneVsOneTurnChangeCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('1v1-guess-made', (data) => {
      console.log('[Service] 1v1-guess-made received:', data);
      this.oneVsOneGuessMadeCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('1v1-game-over', (data) => {
      console.log('[Service] 1v1-game-over received:', data);
      this.oneVsOneGameOverCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('1v1-player-disconnected', (data) => {
      console.log('[Service] 1v1-player-disconnected received:', data);
      this.oneVsOneDisconnectedCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('join-error', (data) => {
      console.warn('[Service] join-error received:', data);
      this.joinErrorCallbacks.forEach(cb => cb(data));
    });

    this.socket.on('room-deleted', () => {
      console.warn('[Service] room-deleted received');
      this.roomDeletedCallbacks.forEach(cb => cb());
    });

    // ── Connection lifecycle ────────────────────────────────────────────
    this.socket.on('connect', () => {
      this.mySocketId = this.socket!.id!;
      console.log(`[Service] ✅ CONNECTED! Socket ID: ${this.mySocketId}`);
      this.socket!.emit('join-room', { roomId, playerName, deviceId });
    });

    this.socket.on('reconnect', () => {
      this.mySocketId = this.socket!.id!;
    });

    this.socket.on('players-updated', (data: { roomId: string; players: Player[] }) => {
      console.log('[Service] 👥 Received players-updated:', data.players);
      this.roomStateSubject.next({ roomId: data.roomId, players: data.players });
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
    this.opponentGuessCallbacks      = [];
    this.playerWonCallbacks          = [];
    this.gameStartedCallbacks        = [];
    this.hostStatusCallbacks         = [];
    this.powerupEffectCallbacks      = [];
    this.oneVsOneStartedCallbacks    = [];
    this.oneVsOneTurnChangeCallbacks = [];
    this.oneVsOneGuessMadeCallbacks  = [];
    this.oneVsOneGameOverCallbacks   = [];
    this.oneVsOneDisconnectedCallbacks = [];
    this.joinErrorCallbacks          = [];
  }

  startGame(roomId: string, mode: string = 'standard') {
    console.log('[Service] Emitting start-game for room:', roomId, 'mode:', mode);
    this.socket?.emit('start-game', { roomId, mode });
  }

  emitGuess(roomId: string, playerName: string, colors: string[], isCorrect: boolean, finishTimeMs?: number, values?: string[]) {
    this.socket?.emit('player-guess', {
      roomId, playerName, playerId: this.mySocketId, colors, values, isCorrect, finishTime: finishTimeMs
    });
  }

  emit1v1Guess(roomId: string, guesserName: string, guessValues: string[], guessColors: string[], isCorrect: boolean, finishMs?: number) {
    this.socket?.emit('1v1-submit-guess', { roomId, guesserName, guessValues, guessColors, isCorrect, finishMs });
  }

  emitPowerup(roomId: string, type: string, playerName: string) {
    this.socket?.emit('use-powerup', { roomId, type, playerName });
  }

  emitSkipTurn(roomId: string) {
    this.socket?.emit('1v1-use-skip', { roomId });
  }

  getSocketId(): string {
    return this.mySocketId || this.socket?.id || '';
  }

  // ── Observables ────────────────────────────────────────────────────────

  onOpponentGuess(): Observable<{ playerName: string; colors: string[]; values?: string[]; isCorrect: boolean; playerId: string; finishTime?: number }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.opponentGuessCallbacks.push(cb);
      return () => { this.opponentGuessCallbacks = this.opponentGuessCallbacks.filter(c => c !== cb); };
    });
  }

  onPlayerWon(): Observable<{ playerName: string; playerId: string; guesses: number; finishTime?: number }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.playerWonCallbacks.push(cb);
      return () => { this.playerWonCallbacks = this.playerWonCallbacks.filter(c => c !== cb); };
    });
  }

  onGameStarted(): Observable<void> {
    return new Observable(observer => {
      const cb = () => observer.next();
      this.gameStartedCallbacks.push(cb);
      return () => { this.gameStartedCallbacks = this.gameStartedCallbacks.filter(c => c !== cb); };
    });
  }

  onHostStatus(): Observable<{ isHost: boolean }> {
    return new Observable(observer => {
      const cb = (data: { isHost: boolean }) => observer.next(data);
      this.hostStatusCallbacks.push(cb);
      return () => { this.hostStatusCallbacks = this.hostStatusCallbacks.filter(c => c !== cb); };
    });
  }

  onPowerupEffect(): Observable<{ type: string; fromPlayerName: string }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.powerupEffectCallbacks.push(cb);
      return () => { this.powerupEffectCallbacks = this.powerupEffectCallbacks.filter(c => c !== cb); };
    });
  }

  on1v1Started(): Observable<{ currentTurnSocketId: string; currentTurnPlayerName: string }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.oneVsOneStartedCallbacks.push(cb);
      return () => { this.oneVsOneStartedCallbacks = this.oneVsOneStartedCallbacks.filter(c => c !== cb); };
    });
  }

  on1v1TurnChange(): Observable<{ currentTurnSocketId: string; currentTurnPlayerName: string; skipped?: boolean; skippedPlayerName?: string }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.oneVsOneTurnChangeCallbacks.push(cb);
      return () => { this.oneVsOneTurnChangeCallbacks = this.oneVsOneTurnChangeCallbacks.filter(c => c !== cb); };
    });
  }

  on1v1GuessMade(): Observable<{ guesserSocketId: string; guesserName: string; guessValues: string[]; guessColors: string[]; isCorrect: boolean; finishMs?: number; guesses: number }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.oneVsOneGuessMadeCallbacks.push(cb);
      return () => { this.oneVsOneGuessMadeCallbacks = this.oneVsOneGuessMadeCallbacks.filter(c => c !== cb); };
    });
  }

  on1v1GameOver(): Observable<{ winnerId: string; winnerName: string; guessCount: number; finishMs?: number }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.oneVsOneGameOverCallbacks.push(cb);
      return () => { this.oneVsOneGameOverCallbacks = this.oneVsOneGameOverCallbacks.filter(c => c !== cb); };
    });
  }

  on1v1PlayerDisconnected(): Observable<{ playerName: string }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.oneVsOneDisconnectedCallbacks.push(cb);
      return () => { this.oneVsOneDisconnectedCallbacks = this.oneVsOneDisconnectedCallbacks.filter(c => c !== cb); };
    });
  }

  onJoinError(): Observable<{ message: string }> {
    return new Observable(observer => {
      const cb = (data: any) => observer.next(data);
      this.joinErrorCallbacks.push(cb);
      return () => { this.joinErrorCallbacks = this.joinErrorCallbacks.filter(c => c !== cb); };
    });
  }

  onRoomDeleted(): Observable<void> {
    return new Observable(observer => {
      const cb = () => observer.next();
      this.roomDeletedCallbacks.push(cb);
      return () => { this.roomDeletedCallbacks = this.roomDeletedCallbacks.filter(c => c !== cb); };
    });
  }

  emitDeleteRoom(roomId: string): void {
    this.socket?.emit('delete-room', { roomId });
  }
}
