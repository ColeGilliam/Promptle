import { Routes } from '@angular/router';
import { HomePage } from './pages/home-page/home-page';
import { PromptleComponent } from './pages/promptle/promptle';

export const routes: Routes = [
  { path: '', component: HomePage },
  { path: 'game', component: PromptleComponent }
];
