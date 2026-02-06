export class CreateProductDto {
  name: string;
  sku: string;
  description?: string | null;
  price: number;
  stock?: number;
  isActive?: boolean;
}
