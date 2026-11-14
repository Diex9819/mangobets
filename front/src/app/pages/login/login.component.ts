import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LoginData } from '../../models/auth.interface';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  errorMessage = '';
  loading = false;

  loginForm = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  onSubmit() {
    if (this.loginForm.invalid) return;

    this.loading = true;
    this.errorMessage = '';

    const credentials = this.loginForm.getRawValue() as LoginData;

    this.authService.login(credentials).subscribe({
      next: (response) => {
        this.loading = false;

        if (response.success && response.token) {
          this.authService.saveSession(response);
          this.router.navigate(['/quiniela']);
        } else {
          this.errorMessage = 'Error en la autenticación';
        }
      },
      error: (err) => {
        this.loading = false;
        console.error('Error de login:', err);
        this.errorMessage = err.error?.message || err.error?.error || 'Usuario o contraseña incorrectos';
      },
    });
  }
}