import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ClientConfig
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

type PresignArgs = {
  key: string;
  contentType: string;
  sizeBytes: number;
  expiresInSec?: number;
};

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly region: string;
  private readonly bucket: string;
  private readonly endpoint?: string;
  private readonly forcePathStyle: boolean;
  private readonly cloudfrontBaseUrl?: string;
  private readonly defaultExpiresInSec: number;

  constructor(private readonly configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') ?? 'eu-central-1';
    this.bucket = this.configService.getOrThrow<string>('AWS_S3_BUCKET');
    this.endpoint = this.configService.get<string>('AWS_S3_ENDPOINT');
    this.forcePathStyle = (this.configService.get<string>('AWS_S3_FORCE_PATH_STYLE') ?? '').toLowerCase() === 'true';
    this.cloudfrontBaseUrl = this.trimTrailingSlash(
      this.configService.get<string>('AWS_CLOUDFRONT_URL')
    );
    this.defaultExpiresInSec = Number(
      this.configService.get<string>('FILES_PRESIGN_EXPIRES_IN_SEC') ?? 900
    );

    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    const clientConfig: S3ClientConfig = {
      region: this.region,
      forcePathStyle: this.forcePathStyle
    };

    if (this.endpoint) {
      clientConfig.endpoint = this.endpoint;
    }

    if (accessKeyId && secretAccessKey) {
      clientConfig.credentials = { accessKeyId, secretAccessKey };
    }

    this.client = new S3Client(clientConfig);
  }

  getBucketName(): string {
    return this.bucket;
  }

  async presignPutObject(args: PresignArgs): Promise<{ uploadUrl: string; expiresInSec: number }> {
    const expiresInSec = args.expiresInSec ?? this.defaultExpiresInSec;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: args.key,
      ContentType: args.contentType,
      ContentLength: args.sizeBytes
    });

    const uploadUrl = await getSignedUrl(this.client, command, {
      expiresIn: expiresInSec
    });

    return { uploadUrl, expiresInSec };
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key
        })
      );
      return true;
    } catch (error: any) {
      const code = error?.$metadata?.httpStatusCode ?? error?.statusCode;
      if (code === 404) {
        return false;
      }
      throw error;
    }
  }

  buildPublicUrl(key: string): string {
    if (this.cloudfrontBaseUrl) {
      return `${this.cloudfrontBaseUrl}/${key}`;
    }

    if (this.endpoint) {
      const endpoint = this.trimTrailingSlash(this.endpoint) ?? this.endpoint;

      if (this.forcePathStyle) {
        return `${endpoint}/${this.bucket}/${key}`;
      }

      return `${endpoint}/${key}`;
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  private trimTrailingSlash(input?: string): string | undefined {
    if (!input) {
      return input;
    }

    return input.replace(/\/+$/, '');
  }
}
