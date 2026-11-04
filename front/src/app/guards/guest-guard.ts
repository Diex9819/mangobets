import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';

export const guestGuard: CanActivateFn = () => {
  const router = inject(Router);
  const token = localStorage.getItem('token');

  // 🔥 si ya está logueado → lo sacamos a la quiniela
  if (token) {
    router.navigate(['/quiniela']);
    return false;
  }

  return true;
};
