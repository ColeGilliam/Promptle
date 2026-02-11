import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PromptleLandingComponent } from './promptle-landing';

describe('PromptleLandingComponent', () => {
  let component: PromptleLandingComponent;
  let fixture: ComponentFixture<PromptleLandingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PromptleLandingComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PromptleLandingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
