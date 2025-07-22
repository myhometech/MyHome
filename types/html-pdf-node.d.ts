declare module 'html-pdf-node' {
  export interface HtmlToPdfOptions {
    format?: 'A4' | 'A3' | 'A5' | 'Legal' | 'Letter' | 'Tabloid';
    width?: number;
    height?: number;
    printBackground?: boolean;
    landscape?: boolean;
    margin?: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
    };
    displayHeaderFooter?: boolean;
    headerTemplate?: string;
    footerTemplate?: string;
    scale?: number;
  }

  export interface HtmlToPdfInput {
    url?: string;
    content?: string;
  }

  export function generatePdf(
    input: HtmlToPdfInput,
    options?: HtmlToPdfOptions
  ): Promise<Buffer>;

  export default {
    generatePdf
  };
}