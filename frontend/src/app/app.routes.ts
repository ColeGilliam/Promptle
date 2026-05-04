import { Routes } from '@angular/router';
import { devGuard } from './guards/dev.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home-page/home-page').then(m => m.HomePage) },
  { path: 'connections', loadComponent: () => import('./pages/connections/connections').then(m => m.ConnectionsComponent) },
  { path: 'crossword', loadComponent: () => import('./pages/crossword/crossword').then(m => m.CrosswordComponent) },
  { path: 'game', loadComponent: () => import('./pages/promptle/promptle').then(m => m.PromptleComponent) },
  { path: 'profile', loadComponent: () => import('./pages/profile/profile').then(m => m.ProfileComponent) },
  { path: 'lobby', loadComponent: () => import('./pages/lobby/lobby').then(m => m.LobbyComponent) },
  { path: 'share', loadComponent: () => import('./pages/share/share').then(m => m.ShareComponent) },
  { path: 'privacy', loadComponent: () => import('./pages/privacy/privacy').then(m => m.PrivacyComponent) },
  { path: 'terms', loadComponent: () => import('./pages/terms/terms').then(m => m.TermsComponent) },
  { path: 'about', loadComponent: () => import('./pages/about-page/about-page').then(m => m.AboutPageComponent), canActivate: [devGuard] },
  { path: 'dev-settings', loadComponent: () => import('./pages/dev-settings/dev-settings').then(m => m.DevSettingsComponent), canActivate: [devGuard] },
  { path: 'testing', loadComponent: () => import('./pages/testing/testing').then(m => m.Testing), canActivate: [devGuard] },
  { path: 'chat', loadComponent: () => import('./pages/chat-room-test/chat-room-test').then(m => m.ChatRoomTest), canActivate: [devGuard] },
  { path: '**', loadComponent: () => import('./pages/not-found/not-found').then(m => m.NotFoundComponent) },
];
