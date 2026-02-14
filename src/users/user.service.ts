import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from './entity/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(
    email: string,
    password?: string,
    roles?: string[],
    scopes?: string[],
  ): Promise<User> {
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) return existingUser;

    const userToCreate: Partial<User> = { email };

    if (password) {
      userToCreate.passwordHash = await bcrypt.hash(password, 10);
    }
    if (roles) {
      userToCreate.roles = roles;
    }
    if (scopes) {
      userToCreate.scopes = scopes;
    }

    const user = this.userRepository.create(userToCreate);
    return this.userRepository.save(user);
  }

  async getAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  async getUser(id: User['id']): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateUser(id: User['id'], updates: Partial<User>): Promise<User> {
    const user = await this.userRepository.preload({
      id,
      ...updates,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.userRepository.save(user);
  }

  async deleteUser(id: User['id']): Promise<void> {
    const result = await this.userRepository.delete({ id });
    if (!result.affected) {
      throw new NotFoundException('User not found');
    }
  }
}
