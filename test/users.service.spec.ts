import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { Repository } from 'typeorm';
import { User } from '../src/users/entity/user.entity';
import { UsersService } from '../src/users/user.service';

describe('UsersService', () => {
  let service: UsersService;
  let repo: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            preload: jest.fn(),
            delete: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repo = module.get<Repository<User>>(getRepositoryToken(User));
  });

  it('creates user if not exists', async () => {
    const user = { id: 'u1', email: 'test@example.com' } as User;

    jest.spyOn(repo, 'findOne').mockResolvedValue(null);
    jest.spyOn(repo, 'create').mockReturnValue(user);
    jest.spyOn(repo, 'save').mockResolvedValue(user);

    const result = await service.create('test@example.com');

    expect(result).toEqual(user);
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { email: 'test@example.com' },
    });
    expect(repo.create).toHaveBeenCalledWith({ email: 'test@example.com' });
    expect(repo.save).toHaveBeenCalledWith(user);
  });

  it('returns existing user on create', async () => {
    const existing = { id: 'u1', email: 'test@example.com' } as User;
    jest.spyOn(repo, 'findOne').mockResolvedValue(existing);

    const result = await service.create('test@example.com');

    expect(result).toEqual(existing);
    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('gets all users', async () => {
    const users = [{ id: 'u1', email: 'a@a.com' } as User];
    jest.spyOn(repo, 'find').mockResolvedValue(users);

    await expect(service.getAll()).resolves.toEqual(users);
  });

  it('gets user by id', async () => {
    const user = { id: 'u2', email: 'two@example.com' } as User;
    jest.spyOn(repo, 'findOne').mockResolvedValue(user);

    await expect(service.getUser('u2')).resolves.toEqual(user);
  });

  it('throws NotFoundException for missing user', async () => {
    jest.spyOn(repo, 'findOne').mockResolvedValue(null);

    await expect(service.getUser('missing')).rejects.toThrow(NotFoundException);
  });

  it('updates user', async () => {
    const user = { id: 'u3', email: 'three@example.com' } as User;
    jest.spyOn(repo, 'preload').mockResolvedValue(user);
    jest.spyOn(repo, 'save').mockResolvedValue(user);

    const result = await service.updateUser('u3', { email: 'x@x.com' });

    expect(result).toEqual(user);
    expect(repo.preload).toHaveBeenCalledWith({
      id: 'u3',
      email: 'x@x.com',
    });
    expect(repo.save).toHaveBeenCalledWith(user);
  });

  it('throws NotFoundException when updating missing user', async () => {
    jest.spyOn(repo, 'preload').mockResolvedValue(null);

    await expect(
      service.updateUser('missing', { email: 'x@x.com' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('deletes user', async () => {
    jest.spyOn(repo, 'delete').mockResolvedValue({ affected: 1 } as never);

    await expect(service.deleteUser('u4')).resolves.toBeUndefined();
  });

  it('throws NotFoundException when deleting missing user', async () => {
    jest.spyOn(repo, 'delete').mockResolvedValue({ affected: 0 } as never);

    await expect(service.deleteUser('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
