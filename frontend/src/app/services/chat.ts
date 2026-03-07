import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import {io, Socket} from 'socket.io-client';

@Injectable({
  providedIn: 'root',
})
export class Chat {
  private socket: Socket;

  private messageSubject = new Subject<{text: string; isOwn?: boolean}>();

  constructor() {
    this.socket = io({
      // DO NOT put 'http://localhost:3001' here. 
      // Leaving it empty forces it to use the current domain (promptle.unr.dev)
      path: '/socket.io/',
      transports: ['polling', 'websocket'], 
      reconnection: true,
      reconnectionAttempts: 5
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
  //this.messageSubject.next({ text, isOwn: true });
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
