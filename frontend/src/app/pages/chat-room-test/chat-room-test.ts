import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-chat-room-test',
  imports: [CommonModule],
  templateUrl: './chat-room-test.html',
  styleUrl: './chat-room-test.css',
})
export class ChatRoomTest {
  message = '';
  send(){
    console.log('hi');
  }
}
