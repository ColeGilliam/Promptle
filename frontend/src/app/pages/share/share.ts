import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { NavbarComponent } from '../../shared/components/navbar/navbar';

@Component({
  selector: 'app-share',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatCardModule, MatIconModule, NavbarComponent],
  templateUrl: './share.html',
  styleUrls: ['./share.css']
})
export class ShareComponent implements OnInit {
  topicName = '';
  guessCount = 0;
  timeMs: number | null = null;
  grid: string[][] = [];  // [rowIndex][colIndex] = 'G'|'Y'|'N'
  playLink = '';

  constructor(private route: ActivatedRoute, private router: Router) {}

  ngOnInit() {
    this.route.queryParamMap.subscribe(params => {
      this.topicName  = params.get('topicname') || 'Unknown Topic';
      this.guessCount = Number(params.get('guesses')) || 0;
      const timeParam = params.get('time');
      this.timeMs     = timeParam ? Number(timeParam) : null;

      const gridParam = params.get('grid') || '';
      this.grid = gridParam.split('-').filter(Boolean).map(row => row.split(''));

      const id     = params.get('id');
      const topic  = params.get('topic');
      if (id) {
        this.playLink = `/game?id=${id}`;
      } else if (topic) {
        this.playLink = `/game?topic=${encodeURIComponent(topic)}`;
      } else {
        this.playLink = '/';
      }
    });
  }

  cellColor(c: string): string {
    if (c === 'G') return 'cell-green';
    if (c === 'Y') return 'cell-yellow';
    return 'cell-gray';
  }

  formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const min      = Math.floor(totalSec / 60);
    const sec      = totalSec % 60;
    const tenths   = Math.floor((ms % 1000) / 100);
    return `${min}:${String(sec).padStart(2, '0')}.${tenths}`;
  }

  playGame() { this.router.navigateByUrl(this.playLink); }
  goHome()   { this.router.navigate(['/']); }
}
