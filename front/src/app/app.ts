import { Component, OnInit } from '@angular/core';
import { ApiService } from './services/api.service';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
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