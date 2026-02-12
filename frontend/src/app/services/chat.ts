import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {io, Socket} from 'socket.io-client';

@Injectable({
  providedIn: 'root',
})
export class Chat {
  private socket: Socket;
  private url = 'http://localhost:3001';

  private messageSubject = new Subject<{text: string; isOwn?: boolean}>();

  constructor() {
    this.socket = io(this.url, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    this.socket.on('chat message', (msg: string) => {
      this.messageSubject.next({text: msg});
    })

    this.socket.on('connect', () => {
      console.log('Connected to Socket.io server');
    });

    this.socket.on('connection_error', (err) => {
      console.error('Socket connection error: ', err.message);
    });

    this.socket.on('disconnect', (reason) => {
      console.log('Disconnected: ', reason);
    })
  }

  sendMessage(room: string, text: string): void {
  if (!text.trim() || !room.trim()) return;

  this.socket.emit('chat message', { room: room.trim(), text });

  // Optimistic: show own message
  this.messageSubject.next({ text, isOwn: true });
}
  getMessages(): Observable<{text: string; isOwn?: boolean}> {
    return this.messageSubject.asObservable();
  }

  connect() {
    this.socket.connect();
  }

  disconnect() {
    this.socket.disconnect();
  }

  joinRoom(room: string): void {
  if (!room.trim()) return;
  this.socket.emit('join room', room.trim());
}

  ngOnDestroy() {
    this.socket.disconnect();
    this.messageSubject.complete();
  }
}
