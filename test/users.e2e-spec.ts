import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from '../src/users/user.service';
import { User } from '../src/users/user.interface';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('creates and returns users', () => {
    const user: User = {
      id: 'u1',
      name: 'Test User',
      email: 'test@example.com',
      password: 'secret',
      phone: 1234567890,
    };

    service.create(user);

    const all = service.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('u1');
  });

  it('gets user by id', () => {
    const user: User = {
      id: 'u2',
      name: 'User Two',
      email: 'two@example.com',
      password: 'secret',
      phone: 1111111111,
    };

    service.create(user);

    const found = service.getUser('u2');
    expect(found.email).toBe('two@example.com');
  });

  it('updates user and returns updated data', () => {
    const user: User = {
      id: 'u3',
      name: 'User Three',
      email: 'three@example.com',
      password: 'secret',
      phone: 2222222222,
    };

    service.create(user);

    const updated = service.updateUser('u3', { name: 'User 3' });
    expect(updated.name).toBe('User 3');
  });

  it('deletes user', () => {
    const user: User = {
      id: 'u4',
      name: 'User Four',
      email: 'four@example.com',
      password: 'secret',
      phone: 3333333333,
    };

    service.create(user);

    service.deleteUser('u4');
    expect(service.getAll()).toHaveLength(0);
  });

  it('throws NotFoundException for missing user', () => {
    expect(() => service.getUser('missing')).toThrow(NotFoundException);
  });
});
