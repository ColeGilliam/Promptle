import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { expandCollapse } from '../../shared/animations';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatListModule } from '@angular/material/list';

import { NavbarComponent } from '../../shared/components/navbar/navbar';
import { MiniFooterComponent } from '../../shared/ui/minifooter/minifooter';
import { AboutTeamCarouselComponent } from '../../shared/ui/about-team-carousel/about-team-carousel';
import { TeamMember } from '../../shared/ui/about-team-carousel/about-team-carousel.models';
import { AuthenticationService } from '../../services/authentication.service';

interface TechItem {
  name: string;
  icon: string;
  desc: string;
}

interface DeployItem {
  label: string;
  icon: string;
  value: string;
}

interface Feature {
  id: string;
  icon: string;
  label: string;
  detail: string;
}

interface ResourceBook {
  title: string;
  author: string;
  citation: string;
  url: string;
  why: string;
}

interface ResourceArticle {
  title: string;
  authors: string;
  citation: string;
  url: string;
  why: string;
}

interface ResourceWeb {
  title: string;
  domain: string;
  icon: string;
  url: string;
  why: string;
}

interface ResourceNews {
  title: string;
  source: string;
  date: string;
  url: string;
  why: string;
}

@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatDividerModule,
    MatChipsModule,
    MatListModule,
    NavbarComponent,
    MiniFooterComponent,
    AboutTeamCarouselComponent,
  ],
  templateUrl: './about-page.html',
  styleUrls: ['./about-page.css'],
  animations: [expandCollapse],
})
export class AboutPageComponent {
  activeFeature: string | null = null;

  features: Feature[] = [
    {
      id: 'ai',
      icon: 'psychology',
      label: 'AI-Generated Puzzles',
      detail: 'Promptle uses OpenAI\'s API to create new puzzle content from a topic chosen by the player. Instead of depending only on a fixed answer list, the game can generate fresh rounds on demand while still keeping the same structured guessing loop. This makes the project more scalable and allows it to support far more subjects than a hand-built database alone could reasonably cover.',
    },
    {
      id: 'multiplayer',
      icon: 'group',
      label: 'Multiplayer',
      detail: 'Promptle is not limited to solo play. The project includes multiplayer support so players can join the same session, play around a shared puzzle, and compete in a more social setting. User accounts and profiles help support that experience by giving players a persistent identity and a foundation for tracking activity across future game modes.',
    },
    {
      id: 'topics',
      icon: 'all_inclusive',
      label: 'Unlimited Topics',
      detail: 'Most guessing games are restricted to whatever categories the developers preload ahead of time. Promptle expands that model by letting players start from existing topics or enter their own ideas for AI-assisted generation. That gives the game much stronger replay value while keeping the rules familiar: each round still revolves around narrowing down one hidden answer through category-based feedback.',
    },
  ];

  toggleFeature(id: string) {
    this.activeFeature = this.activeFeature === id ? null : id;
  }

  get activeFeatureDetail(): string {
    return this.features.find(f => f.id === this.activeFeature)?.detail ?? '';
  }

  members: TeamMember[] = [
    { name: 'Cole Gilliam', role: 'Game Logic / Setup', githubUrl: 'https://github.com/ColeGilliam/' },
    { name: 'Richard Nguyen', role: 'Deployment / User Data', githubUrl: 'https://github.com/rnguyen2024' },
    { name: 'Jorge Cervacio', role: 'UI / Frontend', githubUrl: 'https://github.com/Jorge-Cervacio-Izquierdo' },
    { name: 'Cody Shrive', role: 'AI Features / Testing Tools', githubUrl: 'https://github.com/CodyShrive' },
  ];

  techStack: TechItem[] = [
    { name: 'Angular',          icon: 'web',            desc: 'Frontend framework' },
    { name: 'Angular Material', icon: 'palette',        desc: 'UI component library' },
    { name: 'TypeScript',       icon: 'code',           desc: 'Typed JavaScript' },
    { name: 'Node.js',          icon: 'dns',            desc: 'Backend runtime' },
    { name: 'Express',          icon: 'route',          desc: 'REST API server' },
    { name: 'MongoDB',          icon: 'storage',        desc: 'NoSQL database' },
  ];

  deployInfo: DeployItem[] = [
    { label: 'Hosting',    icon: 'cloud',            value: 'Hosted on a UNR-managed virtual server' },
    { label: 'CI / CD',    icon: 'loop',             value: 'GitHub main branch updates' },
    { label: 'Domain',     icon: 'language',         value: 'https://promptle.unr.dev/' },
    { label: 'Auth',       icon: 'lock',             value: 'Auth0' },
  ];

  problemDomainBook: ResourceBook = {
    title: 'Theory of Fun for Game Design',
    author: 'Raph Koster',
    citation: 'R. Koster, Theory of Fun for Game Design, 2nd ed. Sebastopol, CA, USA: O\'Reilly Media, 2013.',
    url: 'https://theoryoffun.com/excerpt.shtml',
    why: 'This book explains that players stay engaged when they are learning patterns, solving problems, and steadily improving. That idea connects directly to Promptle, where the goal is to keep rounds challenging and replayable through structured hints, multiplayer play, and AI-generated content that prevents the game from becoming repetitive.',
  };

  referenceArticles: ResourceArticle[] = [
    {
      title: 'Using "Wordle" to Assess the Effects of Goal Gradients and Near-Misses',
      authors: 'M. J. Dixon, B. S. Gunpat, I. A. Boucher, M. Tsang, S. Ahmed, G. Shaikevich, I. Dhode, J. Leung, and T. B. Kruger',
      citation: 'Scientific Reports, vol. 14, Art. no. 24336, Oct. 17, 2024. doi: 10.1038/s41598-024-74450-0.',
      url: 'https://doi.org/10.1038/s41598-024-74450-0',
      why: 'This article studies how players react to hints, near-misses, and progress signals in Wordle. That is useful for Promptle because our guess feedback has to keep players motivated without making the game feel frustrating or unfair.',
    },
    {
      title: 'An Exploration of Wordle Game Data and Player Behavioural Habits Based on Time Series and GBDT Models',
      authors: 'Y. Lu, X. Yu, and Y. Gu',
      citation: 'Highlights in Science, Engineering and Technology, vol. 70, pp. 168-174, Nov. 2023. doi: 10.54097/hset.v70i.12177.',
      url: 'https://doi.org/10.54097/hset.v70i.12177',
      why: 'This paper looks at Wordle player data and suggests that more common words are easier to solve, even in harder settings. That matters to Promptle because topic generation and answer selection need to balance familiarity and challenge so one round is not much easier than another.',
    },
    {
      title: 'Research on Predicting Wordle Word Attempt Counts and Word Difficulty Classification Based on Machine Learning and K-Means Clustering Techniques',
      authors: 'Y. Liang, J. Long, C. Tan, and D. Wang',
      citation: 'Highlights in Science, Engineering and Technology, vol. 70, pp. 223-233, Nov. 2023. doi: 10.54097/hset.v70i.12191.',
      url: 'https://doi.org/10.54097/hset.v70i.12191',
      why: 'This article focuses on difficulty classification and how the number of guesses can reflect how hard a word is for players. That insight supports Promptle\'s goal of keeping puzzles fair by avoiding answers that are too obvious or too difficult compared with the rest of the game.',
    },
  ];

  webResources: ResourceWeb[] = [
    {
      title: 'OpenAI API',
      domain: 'platform.openai.com',
      icon: 'psychology',
      url: 'https://platform.openai.com/docs/api-reference/introduction',
      why: 'One of Promptle\'s main features is AI-generated puzzle content. The OpenAI API documentation explains how to send requests, generate responses, and structure the AI-backed gameplay features that make topic-based puzzle generation possible.',
    },
    {
      title: 'Socket.IO',
      domain: 'socket.io',
      icon: 'bolt',
      url: 'https://socket.io/docs/v4/',
      why: 'Promptle uses multiplayer, so players need to join shared sessions and stay in sync in real time. The Socket.IO documentation is useful for understanding client-server communication and implementing the live multiplayer side of the project.',
    },
    {
      title: 'NYT Wordle',
      domain: 'nytimes.com',
      icon: 'grid_on',
      url: 'https://www.nytimes.com/wordle',
      why: 'Wordle is the direct inspiration for Promptle\'s core guessing loop. Reviewing the original game helps guide the project\'s pacing, clarity, and general UI direction while Promptle builds on that model with AI-generated topics and multiplayer support.',
    },
  ];

  newsItems: ResourceNews[] = [
    {
      title: 'New York Times Buys Viral Word Game Wordle',
      source: 'Associated Press / Portland Press Herald',
      date: 'February 1, 2022',
      url: 'https://www.pressherald.com/2022/02/01/new-york-times-buys-viral-word-game-wordle/',
      why: 'This article shows how quickly Wordle grew into a widely recognized online game with millions of daily players. It helps explain why a Wordle-inspired project like Promptle is relevant and why browser-based guessing games have strong public appeal.',
    },
    {
      title: 'Generative AI Use in Video Games Sparks Heated Debates',
      source: 'TechRepublic',
      date: 'July 31, 2025',
      url: 'https://www.techrepublic.com/article/news-video-game-development-generative-ai/',
      why: 'This article discusses how generative AI is being used in game development for content creation, prototyping, and dialogue while also raising ethical and creative concerns. That connects directly to Promptle\'s use of AI-generated puzzle content and the broader role of AI in games.',
    },
  ];

  constructor(private readonly auth: AuthenticationService) {}

  openSignIn() {
    this.auth.login();
  }
}
