import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/types';
import { CompleteUploadDto } from './dto/complete-upload.dto';
import { PresignFileDto } from './dto/presign-file.dto';
import { FilesService } from './files.service';

@UseGuards(JwtAuthGuard)
@Controller('files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('presign')
  async presign(
    @Req() req: Request & { user?: AuthUser },
    @Body() body: PresignFileDto
  ) {
    return this.filesService.createPresignedUpload(req.user as AuthUser, body);
  }

  @Post('complete')
  async complete(
    @Req() req: Request & { user?: AuthUser },
    @Body() body: CompleteUploadDto
  ) {
    return this.filesService.completeUpload(body.fileId, req.user as AuthUser);
  }

  @Get(':id')
  async byId(@Req() req: Request & { user?: AuthUser }, @Param('id') id: string) {
    return this.filesService.getFileById(id, req.user as AuthUser);
  }
}
