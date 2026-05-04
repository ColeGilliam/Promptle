import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { filter, map, take } from 'rxjs/operators';
import { AuthenticationService } from '../services/authentication.service';

const DEV_EMAIL = 'promptle99@gmail.com';

export const devGuard: CanActivateFn = () => {
  const auth = inject(AuthenticationService);
  const router = inject(Router);

  return auth.user$.pipe(
    filter(user => user !== undefined),
    take(1),
    map(user => {
      if (user?.email === DEV_EMAIL) return true;
      return router.createUrlTree(['/']);
    })
  );
};
