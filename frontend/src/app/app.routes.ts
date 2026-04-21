import { Routes } from '@angular/router';
import { HomePage } from './pages/home-page/home-page';
import { AboutPageComponent } from './pages/about-page/about-page';
import { ConnectionsComponent } from './pages/connections/connections';
import { CrosswordComponent } from './pages/crossword/crossword';
import { PromptleComponent } from './pages/promptle/promptle';
import { Testing } from './pages/testing/testing';
import { ProfileComponent } from './pages/profile/profile';
import { ChatRoomTest } from './pages/chat-room-test/chat-room-test';
import { LobbyComponent } from './pages/lobby/lobby';
import { ShareComponent } from './pages/share/share';
import { DevSettingsComponent } from './pages/dev-settings/dev-settings';

export const routes: Routes = [
  {path: '', component: HomePage},
  {path: 'about', component: AboutPageComponent},
  {path: 'connections', component: ConnectionsComponent},
  {path: 'crossword', component: CrosswordComponent},
  {path: 'game', component: PromptleComponent},
  {path: 'testing', component: Testing},
  {path: 'profile', component: ProfileComponent },
  {path: 'chat', component: ChatRoomTest},
  {path: 'lobby', component: LobbyComponent},
  {path: 'share', component: ShareComponent},
  {path: 'dev-settings', component: DevSettingsComponent},
];
