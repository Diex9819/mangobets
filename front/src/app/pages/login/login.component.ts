import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LoginData, RegisterData } from '../../models/auth.interface';

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

  isRegisterMode = false;
  errorMessage = '';
  loading = false;

  loginForm = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  registerForm = this.fb.group({
    name: ['', [Validators.required]],
    username: ['', [Validators.required]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    role: ['ADMIN' as 'ADMIN' | 'EMPLEADO', [Validators.required]],
  });

  toggleMode() {
    this.isRegisterMode = !this.isRegisterMode;
    this.errorMessage = '';
    this.loading = false;
  }

  onSubmit() {
    if (this.isRegisterMode) {
      this.onRegister();
    } else {
      this.onLogin();
    }
  }

  private onLogin() {
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

  private onRegister() {
    if (this.registerForm.invalid) return;

    this.loading = true;
    this.errorMessage = '';

    const data = this.registerForm.getRawValue() as RegisterData;

    this.authService.register(data).subscribe({
      next: (response) => {
        this.loading = false;

        if (response.success && response.token) {
          this.authService.saveSession(response);
          this.router.navigate(['/quiniela']);
        } else {
          this.errorMessage = response.message || response.error || 'No se pudo registrar el usuario';
        }
      },
      error: (err) => {
        this.loading = false;
        console.error('Error de registro:', err);
        this.errorMessage =
          err.error?.message || err.error?.error || 'No se pudo registrar el usuario';
      },
    });
  }
}