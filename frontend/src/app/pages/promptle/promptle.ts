import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


@Component({
  selector: 'app-promptle',
  imports: [CommonModule, FormsModule],
  templateUrl: './promptle.html',
  styleUrl: './promptle.css',
})
export class Promptle {
  list = [
    {
      name: "Walter White",
      occupation: "Teacher, Cook",
    },
    {
      name: "Hank",
      occupation: "DEA"
    },
    {
      name: "Jesse",
      occupation: "Cook"
    }

  ];
  answer = {
    topic: "Breaking Bad",
    name: "Jesse",
    occupation: "Cook"
  };
  headers = [
    {
      key: "answer", label: "Name"
    },
    {
      key: "clue1", label: "Occupation"
    },
    {
      key: "clue2", label: "blank"
    },
    {
      key: "clue3", label: "blank"
    },
    {
      key: "clue4", label: "blank"
    },
  ];
}
