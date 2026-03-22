export interface User {
  id: number;
  name: string;
  email: string;
}

export enum UserRole {
  Admin = 'admin',
  Editor = 'editor',
  Viewer = 'viewer',
}

export type UserCreateInput = Omit<User, 'id'>;
