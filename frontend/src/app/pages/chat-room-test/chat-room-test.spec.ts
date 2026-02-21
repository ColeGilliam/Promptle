import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChatRoomTest } from './chat-room-test';

describe('ChatRoomTest', () => {
  let component: ChatRoomTest;
  let fixture: ComponentFixture<ChatRoomTest>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatRoomTest]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ChatRoomTest);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
