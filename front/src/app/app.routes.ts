import { Routes } from '@angular/router';

// 📦 COMPONENTES
import { LoginComponent } from './pages/login/login.component';
import { HomeComponent } from './pages/home/home.component';
import { QuinielaComponent } from './pages/quiniela/quiniela.component';

// 🔐 GUARDS
import { guestGuard } from './guards/guest-guard';

export const routes: Routes = [
  // 🏆 HOME: TABLA DE POSICIONES (leaderboard) — página principal
  {
    path: '',
    component: HomeComponent,
  },

  // 🔐 LOGIN
  {
    path: 'login',
    component: LoginComponent,
    canActivate: [guestGuard],
  },

  // ⚽ QUINIELAS (pública: se puede ver y pronosticar sin iniciar sesión)
  {
    path: 'quiniela',
    component: QuinielaComponent,
  },

  // ❌ RUTA NO EXISTENTE
  {
    path: '**',
    redirectTo: '',
  },
];
