import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class GameTourService {
  private stepSubject = new BehaviorSubject<number>(0);
  step$ = this.stepSubject.asObservable();

  get step() { return this.stepSubject.value; }

  start() {
    if (localStorage.getItem('promptle-hints') === 'false') return;
    this.stepSubject.next(1);
  }

  advance() {
    const next = this.stepSubject.value + 1;
    if (next > 2) {
      this.finish();
    } else {
      this.stepSubject.next(next);
    }
  }

  skip() { this.finish(); }

  private finish() {
    this.stepSubject.next(0);
  }
}
