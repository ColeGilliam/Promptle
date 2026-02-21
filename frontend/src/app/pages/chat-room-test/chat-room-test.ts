import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Chat } from '../../services/chat';
import { Subscription } from 'rxjs';
import { NavbarComponent } from '../../shared/components/navbar/navbar';

interface Message {
  text: string;
  isOwn?: boolean;
  timestamp: Date;
}

@Component({
  selector: 'app-chat-room-test',
  imports: [CommonModule, FormsModule, NavbarComponent],
  templateUrl: './chat-room-test.html',
  styleUrl: './chat-room-test.css',
})
export class ChatRoomTest implements OnInit, OnDestroy {

  roomName = 'general';          // default room
currentRoom = '';              // shows joined room
hasJoined = false;
  
messages: Message[] = [];
  currentMessage = '';
  private messagesSub!: Subscription;

  constructor(private chat: Chat) {}

  ngOnInit() {
    this.messagesSub = this.chat.getMessages().subscribe(msg => {
      this.messages.push({...msg, timestamp: new Date()});
      // Optional: auto-scroll to bottom
      setTimeout(() => {
        const container = document.querySelector('.messages-container');
        if (container) container.scrollTop = container.scrollHeight;
      }, 50);
    });
  }

  joinRoom() {
  const room = this.roomName.trim();
  if (!room) return;

  this.chat.joinRoom(room);
  this.currentRoom = room;
  this.hasJoined = true;

  // Optional: clear old messages when joining new room
  this.messages = [];
}

  sendMessage() {
  if (!this.currentMessage.trim() || !this.hasJoined) return;

  this.chat.sendMessage(this.currentRoom, this.currentMessage);
  this.currentMessage = '';
}

  ngOnDestroy() {
    this.messagesSub?.unsubscribe();
  }

  // Optional helper – format timestamp if you add it later
  formatTime(date?: Date): string {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

    
  
}
