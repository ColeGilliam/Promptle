import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { MiniFooterComponent } from '../../shared/ui/minifooter/minifooter';

@Component({
  selector: 'app-terms',
  standalone: true,
  imports: [RouterModule, NavbarComponent, MiniFooterComponent],
  templateUrl: './terms.html',
  styleUrls: ['./terms.css'],
})
export class TermsComponent {
  readonly lastUpdated = 'May 2, 2026';
}
