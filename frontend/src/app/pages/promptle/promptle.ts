import { Component } from '@angular/core';

@Component({
  selector: 'app-promptle',
  imports: [],
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
    name: "Jesse",
    occupation: "Cook"
  };
}
