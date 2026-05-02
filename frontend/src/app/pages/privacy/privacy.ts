import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { MiniFooterComponent } from '../../shared/ui/minifooter/minifooter';

@Component({
  selector: 'app-privacy',
  standalone: true,
  imports: [RouterModule, NavbarComponent, MiniFooterComponent],
  templateUrl: './privacy.html',
  styleUrls: ['./privacy.css'],
})
export class PrivacyComponent {
  readonly lastUpdated = 'May 2, 2026';
}
