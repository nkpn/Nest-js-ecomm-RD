import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entity/user.entity';
import { UsersService } from './user.service';

@Module({
  imports: [TypeOrmModule.forFeature([User])], // can be schema, not entity
  providers: [UsersService],
  exports: [UsersService, TypeOrmModule],
})
export class UserModule {}
