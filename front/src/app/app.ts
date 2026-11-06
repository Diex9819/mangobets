import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ApiService } from './services/api.service';
import { NavbarComponent } from './share/navbar/navbar.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class AppComponent implements OnInit {
  status = 'Verificando...';

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.api.get<{ status: string }>('/health').subscribe({
      next: (res) => (this.status = res.status),
      error: () => (this.status = 'No conectado'),
    });
  }
}
