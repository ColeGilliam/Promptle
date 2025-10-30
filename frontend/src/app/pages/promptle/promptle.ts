import { Component } from '@angular/core';
import { Box } from "../../box/box";
import { CommonModule } from '@angular/common';


@Component({
  selector: 'app-promptle',
  imports: [Box, CommonModule],
  templateUrl: './promptle.html',
  styleUrl: './promptle.css',
})
export class Promptle {

  statement: string = 'first';

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
    }
  ];
  guess(){
    this.statement = "new";
  }
}
