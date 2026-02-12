import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrdersModule } from './orders/order.module';
import { ProductsModule } from './products/product.module';
import { UserModule } from './users/user.module';
import { OrdersResolver } from './graphql/orders.resolver';
import { ProductsResolver } from './graphql/products.resolver';
import { OrderItemResolver } from './graphql/order-item.resolver';
import { ProductLoader } from './graphql/dataloaders/product.loader';

@Module({
  imports: [
    OrdersModule,
    ProductsModule,
    UserModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      path: '/graphql',
      playground: true,
      debug: false,
      includeStacktraceInErrorResponses: false,
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'dev'}`, '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('DB_HOST'),
        port: Number(config.get<string>('DB_PORT')) || 1234,
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASS'),
        database: config.get<string>('DB_NAME'),
        ssl:
          config.get('DB_SSL') === 'true'
            ? { rejectUnauthorized: false }
            : undefined,
        logging: ['query', 'error'],
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
  ],
  providers: [
    OrdersResolver,
    ProductsResolver,
    OrderItemResolver,
    ProductLoader,
  ],
})
export class AppModule {}
