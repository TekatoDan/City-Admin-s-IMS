import * as pdfjsLib from 'pdfjs-dist';

// Use Vite's ?url import to correctly bundle the worker
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Extracts all text from a PDF file
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    
    let fullText = '';
    
    // Loop through each page and extract text
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n\n';
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to parse PDF document.');
  }
}

/**
 * Generic text extractor that routes based on file type
 */
export async function extractTextFromFile(file: File): Promise<string> {
  if (file.type === 'application/pdf') {
    return extractTextFromPDF(file);
  }
  
  if (
    file.type.startsWith('text/') || 
    file.type === 'application/json' ||
    file.name.match(/\.(md|ts|js|json|html|css|csv|txt|jsx|tsx)$/i)
  ) {
    return await file.text();
  }
  
  // For other types (DOCX, etc.), we would typically use a library like mammoth.js
  // For this prototype, we'll return a placeholder or throw an error
  throw new Error(`Text extraction for ${file.type} is not yet supported in this demo.`);
}
