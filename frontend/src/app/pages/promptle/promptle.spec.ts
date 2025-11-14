import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PromptleComponent } from './promptle';

describe('PromptleComponent', () => {
  let component: PromptleComponent;
  let fixture: ComponentFixture<PromptleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PromptleComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(PromptleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
