import crypto from 'crypto';
import fs from 'fs';
import { Readable } from 'stream';

/**
 * THMB-1: Source content hashing service
 * Computes SHA256 hashes for document content to enable deterministic thumbnail storage
 */
export class HashingService {
  /**
   * Compute SHA256 hash from a Buffer
   */
  static computeSourceHash(buffer: Buffer): string {
    return crypto.createHash('sha256').update(buffer).digest('hex');
  }

  /**
   * Compute SHA256 hash from a readable stream
   */
  static async computeSourceHashFromStream(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      
      stream.on('data', (chunk) => {
        hash.update(chunk);
      });
      
      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Compute SHA256 hash from a file path
   */
  static async computeSourceHashFromFile(filePath: string): Promise<string> {
    const fileBuffer = await fs.promises.readFile(filePath);
    return this.computeSourceHash(fileBuffer);
  }

  /**
   * Compute SHA256 hash from stream or buffer (unified interface)
   * This is the main interface specified in the ticket
   */
  static async computeSourceHashUnified(streamOrBuffer: Readable | Buffer): Promise<string> {
    if (Buffer.isBuffer(streamOrBuffer)) {
      return this.computeSourceHash(streamOrBuffer);
    } else {
      return this.computeSourceHashFromStream(streamOrBuffer);
    }
  }
}

/**
 * Convenience function for quick hash computation
 * Matches the ticket specification: computeSourceHash(streamOrBuffer): Promise<string>
 */
export const computeSourceHash = HashingService.computeSourceHashUnified;