import { Routes } from '@angular/router';
import { HomePage } from './pages/home-page/home-page';
import { PromptleComponent } from './pages/promptle/promptle';
import { ProfileComponent } from './pages/profile/profile';
import { ChatRoomTest } from './pages/chat-room-test/chat-room-test';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'game', component: PromptleComponent },
  { path: 'profile', component: ProfileComponent },
  { path: 'chat', component: ChatRoomTest }
];
