import { Component } from '@angular/core';
import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { PageBandComponent } from '../../shared/ui/page-band/page-band';

@Component({
  selector: 'app-testing',
  standalone: true,
  imports: [NavbarComponent, PageBandComponent],
  templateUrl: './testing.html',
  styleUrl: './testing.css',
})
export class Testing {

}
