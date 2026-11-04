import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
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

  loginForm: FormGroup = this.fb.group({
    username: ['', [Validators.required]], // 🔥 cambio clave
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  errorMessage: string = '';
  loading = false;

  onSubmit() {
    if (this.loginForm.invalid) return;

    this.loading = true;
    this.errorMessage = '';

    const credentials: LoginData = this.loginForm.value;

    this.authService.login(credentials).subscribe({
      next: (response) => {
        this.loading = false;

        if (response.success && response.token) {

          // 🔥 guardar sesión
          this.authService.saveSession(response);

          // 🔥 redirección a la quiniela (pública, contiene el panel admin)
          this.router.navigate(['/quiniela']);

        } else {
          this.errorMessage = 'Error en la autenticación';
        }
      },
      error: (err) => {
        this.loading = false;
        console.error('Error de login:', err);

        if (err.error?.message) {
          this.errorMessage = err.error.message;
        } else {
          this.errorMessage = 'Usuario o contraseña incorrectos';
        }
      }
    });
  }
}