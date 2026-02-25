import { Component, HostBinding, Input } from '@angular/core';
import { MatCardModule } from '@angular/material/card';

@Component({
  selector: 'page-band',
  standalone: true,
  imports: [MatCardModule],
  templateUrl: './page-band.html',
  styleUrl: './page-band.css',
})
export class PageBandComponent {
  @Input() size: 1 | 2 | 3 | 4 | 5 | string = 3;

  private get normalizedSize(): 1 | 2 | 3 | 4 | 5 {
    const parsed = Number(this.size);
    if (Number.isNaN(parsed)) return 3;
    const clamped = Math.min(5, Math.max(1, Math.round(parsed)));
    return clamped as 1 | 2 | 3 | 4 | 5;
  }

  @HostBinding('class')
  get hostClass(): string {
    return `band-size-${this.normalizedSize}`;
  }
}
