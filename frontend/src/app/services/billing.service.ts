import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';

export interface BillingStatus {
  subscription: {
    status: string;
    subscriptionId: string;
    currentPeriodEnd: string;
  } | null;
  tokenBalance: number;
  hasAccess: boolean;
  isDev: boolean;
  dailyFreeLimit: number;
  freeGenerationsUsedToday: number;
  freeGenerationsRemaining: number;
}

@Injectable({ providedIn: 'root' })
export class BillingService {
  constructor(private http: HttpClient) {}

  getStatus(auth0Id: string): Observable<BillingStatus | null> {
    return this.http.get<BillingStatus>(`/api/billing/status/${auth0Id}`).pipe(
      catchError(() => of(null))
    );
  }

  startCheckout(auth0Id: string, mode: 'subscription' | 'tokens'): Observable<{ url: string }> {
    return this.http.post<{ url: string }>('/api/billing/checkout', { auth0Id, mode });
  }

  openPortal(auth0Id: string): Observable<{ url: string }> {
    return this.http.post<{ url: string }>('/api/billing/portal', { auth0Id });
  }
}
