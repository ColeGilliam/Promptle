import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ToggleMode } from './toggle-mode';

describe('ToggleMode', () => {
  let component: ToggleMode;
  let fixture: ComponentFixture<ToggleMode>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToggleMode]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ToggleMode);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
