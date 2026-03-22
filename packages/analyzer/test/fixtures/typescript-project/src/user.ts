import { User, UserRole } from './types';

export class UserEntity implements User {
  id: number;
  name: string;
  email: string;
  role: UserRole;

  constructor(id: number, name: string, email: string, role: UserRole = UserRole.Viewer) {
    this.id = id;
    this.name = name;
    this.email = email;
    this.role = role;
  }

  isAdmin(): boolean {
    return this.role === UserRole.Admin;
  }
}
