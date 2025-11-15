export interface Product {
  id?: string;
  sku: string;
  name: string;
  slug: string;
  short_description?: string;
  long_description?: string;
  category_id?: string;
  brand_id?: string;

  // Pricing
  price?: number;
  sale_price?: number;
  cost_price?: number;
  currency?: string;

  // Stock
  stock_quantity?: number;
  low_stock_threshold?: number;

  // Physical attributes
  weight?: number;
  width?: number;
  height?: number;
  depth?: number;
  dimension_unit?: string;
  weight_unit?: string;

  // SEO
  meta_title?: string;
  meta_description?: string;
  meta_keywords?: string;

  // Status
  is_active?: boolean;
  is_featured?: boolean;
  is_new?: boolean;
  visibility?: string;

  // Supplier info
  supplier_name?: string;
  supplier_sku?: string;
  supplier_notes?: string;

  // Timestamps
  created_at?: Date;
  updated_at?: Date;
  published_at?: Date;
}

export interface ProductImage {
  id?: string;
  product_id: string;
  url: string;
  thumbnail_url?: string;
  alt_text?: string;
  position?: number;
  is_primary?: boolean;
  file_size?: number;
  width?: number;
  height?: number;
  created_at?: Date;
}

export interface ProductAttribute {
  id?: string;
  product_id: string;
  attribute_id: string;
  attribute_value_id?: string;
  custom_value?: string;
  created_at?: Date;
}

export interface ProductTranslation {
  id?: string;
  product_id: string;
  language_code: string;
  name?: string;
  short_description?: string;
  long_description?: string;
  meta_title?: string;
  meta_description?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface ProductWithDetails extends Product {
  images?: ProductImage[];
  attributes?: ProductAttribute[];
  translations?: ProductTranslation[];
  category?: Category;
  brand?: Brand;
}

export interface Category {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  parent_id?: string;
  position?: number;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface Brand {
  id?: string;
  name: string;
  slug: string;
  description?: string;
  logo_url?: string;
  website?: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface Attribute {
  id?: string;
  name: string;
  slug: string;
  type?: string;
  is_filterable?: boolean;
  position?: number;
  created_at?: Date;
}

export interface AttributeValue {
  id?: string;
  attribute_id: string;
  value: string;
  position?: number;
  created_at?: Date;
}

export interface ImportHistory {
  id?: string;
  filename?: string;
  file_type?: string;
  total_rows?: number;
  successful_rows?: number;
  failed_rows?: number;
  status?: string;
  error_log?: string;
  imported_by?: string;
  started_at?: Date;
  completed_at?: Date;
}

export interface User {
  id?: string;
  email: string;
  password_hash?: string;
  full_name?: string;
  role?: string;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}
