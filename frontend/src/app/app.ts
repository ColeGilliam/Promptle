import { Component, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { CommonModule, NgIf, AsyncPipe} from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, AsyncPipe, NgIf, HttpClientModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})

export class App implements OnInit{
  protected readonly title = signal('Promptle');
  constructor(public auth: AuthService, private http: HttpClient) {}
  ngOnInit() {
    this.auth.user$.subscribe(user => {
      if (user) {
        console.log('Auth0 user:', user);
        // send user info to backend
        this.http.post('http://localhost:3001/api/users/register', {
          auth0_sub: user.sub,
          email: user.email
        }).subscribe({
          next: () => console.log('User stored in MongoDB'),
          error: err => console.error('Error storing user:', err)
        });
      }
    });
  }
  get windowRef() {
    return window;
  }
}
