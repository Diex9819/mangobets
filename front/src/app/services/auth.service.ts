import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, tap, BehaviorSubject } from 'rxjs';
import { environment } from '../../environment/environment';
import { AuthResponse, LoginData, RegisterData } from '../models/auth.interface';

@Injectable({
  providedIn: 'root',
})
export class AuthService {

  private apiUrl = environment.apiUrl + '/auth';

  // 🧠 Estado reactivo del usuario (BehaviorSubject → emite el último valor al suscribirse)
  private userSubject = new BehaviorSubject<any>(this.readUser());
  readonly user$ = this.userSubject.asObservable();

  constructor(private http: HttpClient) {}

  // 🔐 LOGIN
  login(credentials: LoginData): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, credentials).pipe(
      tap((res) => {
        localStorage.setItem('token', res.token);
        this.updateUser(res.user);
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

  // 👤 USER
  getUser(): any {
    return this.userSubject.value;
  }

  // 💾 GUARDAR SESIÓN (login / registro / refresh)
  saveSession(res: any) {
    localStorage.setItem('token', res.token);
    this.updateUser(res.user);
  }

  // 🔓 LOGOUT
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.userSubject.next({});
  }

  // 🧠 Actualizar estado reactivo del usuario
  private updateUser(user: any) {
    this.userSubject.next(user);
    localStorage.setItem('user', JSON.stringify(user));
  }

  // 📖 Estado inicial del usuario desde localStorage
  private readUser(): any {
    try {
      return JSON.parse(localStorage.getItem('user') || '{}');
    } catch {
      return {};
    }
  }
}
