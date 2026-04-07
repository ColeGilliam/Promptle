import { of } from 'rxjs';
import { PromptleComponent } from './promptle';
import { GameCell } from '../../services/setup-game';

describe('PromptleComponent feedback scoring', () => {
  let component: PromptleComponent;

  beforeEach(() => {
    component = new PromptleComponent(
      {} as any,
      { navigate: jasmine.createSpy('navigate') } as any,
      {} as any,
      { user$: of(null) } as any,
      {
        get: jasmine.createSpy('get').and.returnValue(of({})),
        post: jasmine.createSpy('post').and.returnValue(of({})),
      } as any,
      {
        emit1v1Guess: jasmine.createSpy('emit1v1Guess'),
        emitGuess: jasmine.createSpy('emitGuess'),
        getSocketId: jasmine.createSpy('getSocketId').and.returnValue(''),
      } as any,
      { detectChanges: jasmine.createSpy('detectChanges') } as any
    );
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('marks list-style categories yellow when any item overlaps in the same column', () => {
    const colors = component['evaluateGuessColors'](
      [
        textCell('Hero B'),
        textCell('Avengers'),
        setCell('Strength, Flight', ['Strength', 'Flight']),
      ],
      [
        textCell('Hero A'),
        textCell('Justice League'),
        setCell('Flight, Laser Vision', ['Flight', 'Laser Vision']),
      ]
    );

    expect(colors).toEqual(['gray', 'gray', 'yellow']);
  });

  it('marks structured references yellow when the label matches but the value differs', () => {
    const colors = component['evaluateGuessColors'](
      [textCell('Villain'), referenceCell('Amazing Fantasy #16', 'Amazing Fantasy', '16')],
      [textCell('Hero'), referenceCell('Amazing Fantasy #15', 'Amazing Fantasy', '15')]
    );

    expect(colors[1]).toBe('yellow');
  });

  it('keeps structured references gray when the valuematches but the label differs', () => {
    const colors = component['evaluateGuessColors'](
      [textCell('Villain'), referenceCell('Detective Comics #15', 'Detective Comics', '15')],
      [textCell('Hero'), referenceCell('Amazing Fantasy #15', 'Amazing Fantasy', '15')]
    );

    expect(colors[1]).toBe('gray');
  });

  it('keeps text cells gray when they share only one token', () => {
    const colors = component['evaluateGuessColors'](
      [textCell('Villain'), textCell('Moon Knight')],
      [textCell('Hero'), textCell('Dark Knight')]
    );

    expect(colors[1]).toBe('gray');
  });

  // TODO: Quantitative number feedback tests once that logic is implemented
});

function textCell(display: string): GameCell {
  return {
    display,
    kind: 'text',
    parts: { tokens: display.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean) },
  };
}

function setCell(display: string, items: string[]): GameCell {
  return { display, kind: 'set', items };
}

function referenceCell(display: string, label: string, number: string): GameCell {
  return {
    display,
    kind: 'reference',
    parts: {
      label,
      number,
      tokens: label.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean),
    },
  };
}

function numberCell(display: string, value: number): GameCell {
  return {
    display,
    kind: 'number',
    parts: { value },
  };
}
