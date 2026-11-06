import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.css',
})
export class NavbarComponent implements OnInit, OnDestroy {

  user: any = {};
  haySesion = false;

  private userSub?: Subscription;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit() {
    // 🧠 Suscribirse al estado reactivo del usuario → el navbar se actualiza solo
    this.userSub = this.authService.user$.subscribe((user) => {
      this.user = user;
      this.haySesion = !!this.authService.getToken() && !!(user && user.name);
    });
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
  }

  // 👑 ¿Es administrador? (habilita el panel de gestión de jornadas)
  get isAdmin(): boolean {
    return this.user?.role === 'ADMIN';
  }

  logout() {
    // 🔓 Limpiar sesión (token + user) y actualizar estado reactivo
    this.authService.logout();

    // 🚪 Redirigir a la vista pública (Home / Tabla de Posiciones)
    this.router.navigate(['/']);
  }
}
