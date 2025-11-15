import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ImageUploadResult {
  url: string;
  thumbnail_url: string;
  width: number;
  height: number;
  file_size: number;
}

export class ImageService {
  private uploadDir: string;
  private quality: number;
  private maxWidth: number;
  private maxHeight: number;
  private thumbnailWidth: number;
  private thumbnailHeight: number;

  constructor() {
    this.uploadDir = process.env.UPLOAD_DIR || './uploads';
    this.quality = parseInt(process.env.IMAGE_QUALITY || '80');
    this.maxWidth = parseInt(process.env.IMAGE_MAX_WIDTH || '2000');
    this.maxHeight = parseInt(process.env.IMAGE_MAX_HEIGHT || '2000');
    this.thumbnailWidth = parseInt(process.env.THUMBNAIL_WIDTH || '300');
    this.thumbnailHeight = parseInt(process.env.THUMBNAIL_HEIGHT || '300');
  }

  /**
   * Ensure upload directories exist
   */
  async ensureDirectories(): Promise<void> {
    const dirs = [
      this.uploadDir,
      path.join(this.uploadDir, 'products'),
      path.join(this.uploadDir, 'products', 'thumbnails'),
    ];

    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
      }
    }
  }

  /**
   * Process and optimize uploaded image
   */
  async processImage(file: Express.Multer.File): Promise<ImageUploadResult> {
    await this.ensureDirectories();

    const fileId = uuidv4();
    const ext = 'jpg'; // Convert all to JPEG for consistency

    const filename = `${fileId}.${ext}`;
    const thumbnailFilename = `${fileId}_thumb.${ext}`;

    const imagePath = path.join(this.uploadDir, 'products', filename);
    const thumbnailPath = path.join(this.uploadDir, 'products', 'thumbnails', thumbnailFilename);

    // Process main image
    const imageBuffer = await sharp(file.buffer)
      .resize(this.maxWidth, this.maxHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: this.quality })
      .toBuffer();

    await fs.writeFile(imagePath, imageBuffer);

    // Get image metadata
    const metadata = await sharp(imageBuffer).metadata();

    // Create thumbnail
    await sharp(file.buffer)
      .resize(this.thumbnailWidth, this.thumbnailHeight, {
        fit: 'cover',
      })
      .jpeg({ quality: this.quality })
      .toFile(thumbnailPath);

    const fileSize = imageBuffer.length;

    return {
      url: `/uploads/products/${filename}`,
      thumbnail_url: `/uploads/products/thumbnails/${thumbnailFilename}`,
      width: metadata.width || 0,
      height: metadata.height || 0,
      file_size: fileSize,
    };
  }

  /**
   * Process image from URL (for supplier imports)
   */
  async processImageFromUrl(imageUrl: string): Promise<ImageUploadResult> {
    try {
      await this.ensureDirectories();

      // Fetch image
      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      const fileId = uuidv4();
      const ext = 'jpg';

      const filename = `${fileId}.${ext}`;
      const thumbnailFilename = `${fileId}_thumb.${ext}`;

      const imagePath = path.join(this.uploadDir, 'products', filename);
      const thumbnailPath = path.join(this.uploadDir, 'products', 'thumbnails', thumbnailFilename);

      // Process main image
      const imageBuffer = await sharp(buffer)
        .resize(this.maxWidth, this.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: this.quality })
        .toBuffer();

      await fs.writeFile(imagePath, imageBuffer);

      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();

      // Create thumbnail
      await sharp(buffer)
        .resize(this.thumbnailWidth, this.thumbnailHeight, {
          fit: 'cover',
        })
        .jpeg({ quality: this.quality })
        .toFile(thumbnailPath);

      const fileSize = imageBuffer.length;

      return {
        url: `/uploads/products/${filename}`,
        thumbnail_url: `/uploads/products/thumbnails/${thumbnailFilename}`,
        width: metadata.width || 0,
        height: metadata.height || 0,
        file_size: fileSize,
      };
    } catch (error) {
      console.error('Error processing image from URL:', error);
      throw error;
    }
  }

  /**
   * Delete image files
   */
  async deleteImage(imageUrl: string): Promise<void> {
    try {
      const imagePath = path.join(process.cwd(), imageUrl);
      await fs.unlink(imagePath);

      // Try to delete thumbnail if it exists
      const thumbnailUrl = imageUrl.replace('/products/', '/products/thumbnails/').replace('.jpg', '_thumb.jpg');
      const thumbnailPath = path.join(process.cwd(), thumbnailUrl);

      try {
        await fs.unlink(thumbnailPath);
      } catch {
        // Thumbnail might not exist, ignore error
      }
    } catch (error) {
      console.error('Error deleting image:', error);
      throw error;
    }
  }

  /**
   * Validate image file
   */
  isValidImage(mimetype: string): boolean {
    const allowedTypes = (process.env.ALLOWED_IMAGE_TYPES || 'image/jpeg,image/png,image/webp,image/gif').split(',');
    return allowedTypes.includes(mimetype);
  }

  /**
   * Validate file size
   */
  isValidSize(size: number): boolean {
    const maxSize = parseInt(process.env.MAX_FILE_SIZE || '10485760'); // 10MB default
    return size <= maxSize;
  }
}

export default new ImageService();
