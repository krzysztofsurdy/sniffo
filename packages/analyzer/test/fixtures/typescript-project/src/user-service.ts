import { UserEntity } from './user';
import type { User, UserCreateInput } from './types';

export class UserService {
  private users: Map<number, UserEntity> = new Map();

  async findById(id: number): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async create(input: UserCreateInput): Promise<User> {
    const id = this.users.size + 1;
    const user = new UserEntity(id, input.name, input.email);
    this.users.set(id, user);
    return user;
  }

  async findAll(): Promise<User[]> {
    return Array.from(this.users.values());
  }
}
