/**
 * PDF renderer abstraction (ADR-020). PDFKit is the v1 engine; the token allows
 * replacement without touching business code.
 */
export interface ReceiptPdfData {
  receiptNumber: number;
  receiptType: 'RECEIPT' | 'PAYMENT_VOUCHER';
  transactionNumber: number;
  transactionType: string;
  description: string;
  amountIqd: number;
  currency: string;
  amountOriginal: number;
  exchangeRate: number;
  fundName: string;
  personName?: string;
  paymentMethod: string;
  transactionDate: Date;
  issuedAt: Date;
  qrPngBuffer?: Buffer;
  organizationName?: string;
  organizationNameAr?: string;
}

export interface PdfRenderer {
  renderReceipt(data: ReceiptPdfData): Promise<Buffer>;
}
