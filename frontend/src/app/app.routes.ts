import { Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';
import { PromptleComponent } from './pages/promptle/promptle';

export const routes: Routes = [
  { path: '', component: HomeComponent },       // Home page
  { path: 'game', component: PromptleComponent },   // Game page
];
