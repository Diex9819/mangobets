import { Routes } from '@angular/router';

// 📦 COMPONENTES
import { LoginComponent } from './pages/login/login.component';
import { QuinielaComponent } from './pages/quiniela/quiniela.component';

// 🔐 GUARDS
import { guestGuard } from './guards/guest-guard';

export const routes: Routes = [
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

  // 🔄 REDIRECCIÓN
  {
    path: '',
    redirectTo: 'quiniela',
    pathMatch: 'full',
  },

  // ❌ RUTA NO EXISTENTE
  {
    path: '**',
    redirectTo: 'quiniela',
  },
];
