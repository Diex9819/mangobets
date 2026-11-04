import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { AuthResponse, LoginData, RegisterData } from '../models/auth.interface';
import { environment } from '../../environment/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private apiUrl = environment.apiUrl + '/auth';

  constructor(private http: HttpClient) {}

  // 🔐 LOGIN
  login(credentials: LoginData): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials)
      .pipe(
        tap(res => {
          localStorage.setItem('token', res.token);
          localStorage.setItem('user', JSON.stringify(res.user));
        })
      );
  }

  // 👑 REGISTER (solo admin)
  register(userData: RegisterData): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, userData);
  }

  // 🔑 TOKEN
  getToken(): string | null {
    return localStorage.getItem('token');
  }

  // ✅ LOGIN STATUS
  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  saveSession(res: any) {
  localStorage.setItem('token', res.token);
  localStorage.setItem('user', JSON.stringify(res.user));
}

  // 👤 USER
  getUser() {
    return JSON.parse(localStorage.getItem('user') || '{}');
  }

  // 🔓 LOGOUT
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }
}