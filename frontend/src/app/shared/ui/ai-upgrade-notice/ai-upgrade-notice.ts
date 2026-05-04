import { Component, EventEmitter, Output } from '@angular/core';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-ai-upgrade-notice',
  standalone: true,
  imports: [MatIconModule, MatButtonModule],
  templateUrl: './ai-upgrade-notice.html',
  styleUrls: ['./ai-upgrade-notice.css'],
})
export class AiUpgradeNoticeComponent {
  @Output() dismissed = new EventEmitter<void>();
  dismissing = false;

  constructor(private router: Router) {}

  goToUpgrade() {
    this.router.navigate(['/profile']);
  }

  dismiss() {
    this.dismissing = true;
    setTimeout(() => this.dismissed.emit(), 180);
  }
}
