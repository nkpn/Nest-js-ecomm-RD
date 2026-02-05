import { Controller, Get, Post, Put, Body, HttpCode } from '@nestjs/common';
import { UsersService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './user.interface';

@Controller('users')
export class UsersController {
  constructor(private userService: UsersService) {}

  @Get()
  getAll(): User[] {
    return this.userService.getAll();
  }

  @Get()
  getUser(id): User[] {
    return this.userService.getAll();
  }

  @Post()
  @HttpCode(204)
  create(@Body() body: CreateUserDto): void {
    this.userService.create(body);
  }

  @Put()
  update(): string {
    return 'update user data';
  }
}
