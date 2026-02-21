import { Routes } from '@angular/router';
import { HomePage } from './pages/home-page/home-page';
import { PromptleComponent } from './pages/promptle/promptle';
import { AboutComponent } from './pages/about/about';
import { PromptleLandingComponent } from './pages/promptle-landing/promptle-landing';
import { Testing } from './pages/testing/testing';
import { ProfileComponent } from './pages/profile/profile';
import { ChatRoomTest } from './pages/chat-room-test/chat-room-test';

export const routes: Routes = [
  {path: '', component: HomePage},
  {path: 'landing', component: PromptleLandingComponent},
  {path: 'about', component: AboutComponent},
  {path: 'game', component: PromptleComponent},
  {path: 'testing', component: Testing},
  { path: 'profile', component: ProfileComponent },
  { path: 'chat', component: ChatRoomTest }
];
