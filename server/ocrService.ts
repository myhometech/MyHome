import OpenAI from "openai";
import fs from "fs";

// the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function extractTextFromImage(filePath: string, mimeType?: string): Promise<string> {
  try {
    console.log(`Starting OCR for file: ${filePath}`);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read the image file and convert to base64
    const imageBuffer = fs.readFileSync(filePath);
    const base64Image = imageBuffer.toString('base64');
    
    console.log(`File read successfully, size: ${imageBuffer.length} bytes`);

    // Determine the correct MIME type for the data URL
    let dataUrlMimeType = 'image/jpeg'; // default
    if (mimeType) {
      if (mimeType === 'image/png') dataUrlMimeType = 'image/png';
      else if (mimeType === 'image/webp') dataUrlMimeType = 'image/webp';
      else if (mimeType === 'image/jpg') dataUrlMimeType = 'image/jpeg';
    }
    
    console.log(`Using MIME type: ${dataUrlMimeType}`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text from this document image. Return only the extracted text, preserving line breaks and formatting as much as possible. If no text is found, return 'No text detected'."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${dataUrlMimeType};base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 2000,
    });

    const extractedText = response.choices[0]?.message?.content || 'No text detected';
    console.log(`OCR completed successfully, extracted ${extractedText.length} characters`);
    return extractedText.trim();
  } catch (error: any) {
    console.error("OCR extraction failed:", error);
    console.error("Error details:", {
      message: error?.message || 'Unknown error',
      stack: error?.stack,
      filePath,
      mimeType
    });
    throw new Error(`Failed to extract text from image: ${error?.message || 'Unknown error'}`);
  }
}

export function isImageFile(mimeType: string): boolean {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(mimeType);
}

export function isPDFFile(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

export function supportsOCR(mimeType: string): boolean {
  return isImageFile(mimeType) || isPDFFile(mimeType);
}