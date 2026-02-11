import { Routes } from '@angular/router';
import { HomePage } from './home-page/home-page';
import { PromptleComponent } from './pages/promptle/promptle';
import { AboutComponent } from './pages/about/about';

export const routes: Routes = [
  {path: '', component: HomePage},
  {path: 'about', component: AboutComponent},
  {path: 'game', component: PromptleComponent}
];
