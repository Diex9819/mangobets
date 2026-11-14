export interface LoginData {
  username: string; 
  password: string;
}

export interface RegisterData {
  name: string;
  username: string;
  password: string;
  role?: 'ADMIN' | 'EMPLEADO';
}

export interface AuthResponse {
  success: boolean;
  token: string;
  user: {
    _id: string;
    name: string;
    username: string;
    role: 'ADMIN' | 'EMPLEADO';
  };
  message?: string;
  error?: string;
}