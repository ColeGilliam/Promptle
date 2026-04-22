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
      { detectChanges: jasmine.createSpy('detectChanges') } as any,
      {} as any,
      {} as any,
      {} as any
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

  it('marks structured references yellow with an upward arrow when the label matches', () => {
    component.answers = [
      answer('Guess', [textCell('Guess'), referenceCell('Amazing Fantasy #15', 'Amazing Fantasy', '15')]),
      answer('Correct', [textCell('Correct'), referenceCell('Amazing Fantasy #40', 'Amazing Fantasy', '40')]),
    ];

    const feedback = component['evaluateGuessFeedback'](
      component.answers[0].cells,
      component.answers[1].cells
    );

    expect(feedback[1]).toEqual(jasmine.objectContaining({ color: 'yellow', direction: 'up' }));
  });

  it('keeps structured references yellow even when the number gap is large', () => {
    component.answers = [
      answer('Guess', [textCell('Guess'), referenceCell('Amazing Fantasy #14', 'Amazing Fantasy', '14')]),
      answer('Correct', [textCell('Correct'), referenceCell('Amazing Fantasy #115', 'Amazing Fantasy', '115')]),
    ];

    const feedback = component['evaluateGuessFeedback'](
      component.answers[0].cells,
      component.answers[1].cells
    );

    expect(feedback[1]).toEqual(jasmine.objectContaining({ color: 'yellow', direction: 'up' }));
  });

  it('keeps structured references gray when the value matches but the label differs', () => {
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

  it('marks number cells green when the numeric value matches even if the display units differ', () => {
    const colors = component['evaluateGuessColors'](
      [textCell('Villain'), numberCell('72 in', 72, 'in')],
      [textCell('Hero'), numberCell('72 inches', 72, 'inches')]
    );

    expect(colors[1]).toBe('green');
  });

  it('marks number cells yellow exactly at the 25% range threshold', () => {
    component.answers = [
      // Column values span 20..120, so the range is 100 and 25% of that range is 25.
      answer('Guess', [textCell('Guess'), numberCell('20', 20)]),
      answer('Correct', [textCell('Correct'), numberCell('45', 45)]),
      answer('High', [textCell('High'), numberCell('120', 120)]),
    ];

    const feedback = component['evaluateGuessFeedback'](
      component.answers[0].cells,
      component.answers[1].cells
    );

    expect(feedback[1]).toEqual(jasmine.objectContaining({ color: 'yellow', direction: 'up' }));
  });

  it('keeps number cells gray when they are just beyond the 25% range threshold', () => {
    component.answers = [
      // Column values span 19..120, so the range is 101 and 25% is 25.25; diff 26 should stay gray.
      answer('Guess', [textCell('Guess'), numberCell('19', 19)]),
      answer('Correct', [textCell('Correct'), numberCell('45', 45)]),
      answer('High', [textCell('High'), numberCell('120', 120)]),
    ];

    const feedback = component['evaluateGuessFeedback'](
      component.answers[0].cells,
      component.answers[1].cells
    );

    expect(feedback[1]).toEqual(jasmine.objectContaining({ color: 'gray', direction: 'up' }));
  });

  it('marks far number cells gray and points downward when the answer is lower', () => {
    component.answers = [
      answer('Guess', [textCell('Guess'), numberCell('120', 120)]),
      answer('Upper', [textCell('Upper'), numberCell('110', 110)]),
      answer('Correct', [textCell('Correct'), numberCell('80', 80)]),
      answer('Low', [textCell('Low'), numberCell('60', 60)]),
    ];

    const feedback = component['evaluateGuessFeedback'](
      component.answers[0].cells,
      component.answers[2].cells
    );

    expect(feedback[1]).toEqual(jasmine.objectContaining({ color: 'gray', direction: 'down' }));
  });

});

function answer(name: string, cells: GameCell[]) {
  return {
    name,
    cells,
    values: cells.map((cell) => cell.display),
  };
}

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

function numberCell(display: string, value: number, unit?: string): GameCell {
  return {
    display,
    kind: 'number',
    parts: { value, ...(unit ? { unit } : {}) },
  };
}
