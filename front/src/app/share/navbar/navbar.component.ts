import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent {
  user = JSON.parse(localStorage.getItem('user') || '{}');

  constructor(private router: Router) {}

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/quiniela']);
  }

  get isAdmin() {
    return this.user.role === 'ADMIN';
  }

  // 🔐 ¿Hay sesión iniciada?
  // Si no la hay, el navbar solo muestra el logo y la pestaña pública (Quinielas).
  get haySesion() {
    return !!localStorage.getItem('token') && !!this.user?.name;
  }
}
