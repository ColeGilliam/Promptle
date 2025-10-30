import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Promptle } from './promptle';

describe('Promptle', () => {
  let component: Promptle;
  let fixture: ComponentFixture<Promptle>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Promptle]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Promptle);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
