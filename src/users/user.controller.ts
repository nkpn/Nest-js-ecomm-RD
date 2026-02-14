import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { User } from './entity/user.entity';
import { UsersService } from './user.service';

@Controller('users')
export class UsersController {
  constructor(private userService: UsersService) {}

  @Get()
  getAll(): Promise<User[]> {
    return this.userService.getAll();
  }

  @Get(':id')
  getUser(@Param('id') id: string): Promise<User> {
    return this.userService.getUser(id);
  }

  @Post()
  create(@Body() body: CreateUserDto): Promise<User> {
    return this.userService.create(
      body.email,
      body.password,
      body.roles,
      body.scopes,
    );
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<User>): Promise<User> {
    return this.userService.updateUser(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string): Promise<void> {
    return this.userService.deleteUser(id);
  }
}
