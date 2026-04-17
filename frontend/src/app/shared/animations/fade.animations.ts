import {
  trigger,
  style,
  animate,
  transition,
} from '@angular/animations';

/** Fade + lift in when element enters the DOM (:enter). */
export const fadeInUp = trigger('fadeInUp', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(18px)' }),
    animate('320ms cubic-bezier(0.4, 0, 0.2, 1)', style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
]);

/** Simple fade in/out on :enter / :leave. */
export const fadeInOut = trigger('fadeInOut', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('240ms ease', style({ opacity: 1 })),
  ]),
  transition(':leave', [
    animate('200ms ease', style({ opacity: 0 })),
  ]),
]);

/**
 * Smoothly expands from height 0 → natural height on enter,
 * collapses back on leave. Use on elements toggled with @if.
 */
export const expandCollapse = trigger('expandCollapse', [
  transition(':enter', [
    style({
      height: 0,
      opacity: 0,
      overflow: 'hidden',
      marginTop: 0,
      paddingTop: 0,
      paddingBottom: 0,
    }),
    animate('320ms cubic-bezier(0.4, 0, 0.2, 1)', style({
      height: '*',
      opacity: 1,
      marginTop: '*',
      paddingTop: '*',
      paddingBottom: '*',
    })),
  ]),
  transition(':leave', [
    style({ overflow: 'hidden' }),
    animate('260ms cubic-bezier(0.4, 0, 0.2, 1)', style({
      height: 0,
      opacity: 0,
      marginTop: 0,
      paddingTop: 0,
      paddingBottom: 0,
    })),
  ]),
]);
