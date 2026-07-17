import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync } from 'fs';
import PDFDocument from 'pdfkit';
import { PdfRenderer, ReceiptPdfData } from './pdf-renderer.interface';

/**
 * PDFKit receipt renderer (ADR-020).
 * Arabic support: register an Arabic-capable TTF via RECEIPT_FONT_PATH
 * (e.g. Noto Naskh Arabic / Amiri). PDFKit's fontkit performs OpenType shaping.
 * Layout is right-aligned bilingual. Without a font configured, Arabic strings
 * fall back to transliterated English labels and a warning is logged.
 */
@Injectable()
export class PdfkitRenderer implements PdfRenderer {
  private readonly logger = new Logger(PdfkitRenderer.name);
  private readonly fontPath?: string;

  constructor(config: ConfigService) {
    const path = config.get<string>('RECEIPT_FONT_PATH');
    if (path && existsSync(path)) {
      this.fontPath = path;
    } else if (path) {
      this.logger.warn(`RECEIPT_FONT_PATH set but file not found: ${path}`);
    } else {
      this.logger.warn('RECEIPT_FONT_PATH not set: Arabic text on receipts will be limited until an Arabic TTF is configured.');
    }
  }

  async renderReceipt(data: ReceiptPdfData): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A5', margin: 36 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const arabic = Boolean(this.fontPath);
    if (this.fontPath) {
      doc.registerFont('body', this.fontPath);
      doc.font('body');
    } else {
      doc.font('Helvetica');
    }

    const orgAr = data.organizationNameAr ?? 'مؤسسة الأمل';
    const orgEn = data.organizationName ?? 'Amal Foundation';
    const isVoucher = data.receiptType === 'PAYMENT_VOUCHER';
    const titleAr = isVoucher ? 'سند صرف' : 'سند قبض';
    const titleEn = isVoucher ? 'Payment Voucher' : 'Receipt';

    // Header
    doc.fontSize(16).text(arabic ? orgAr : orgEn, { align: 'center' });
    doc.fontSize(10).text(arabic ? orgEn : '', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text(arabic ? `${titleAr} — ${titleEn}` : titleEn, { align: 'center' });
    doc.moveDown();

    // Body rows (label: value), right-aligned for RTL reading order.
    const rows: [string, string][] = [
      [arabic ? 'رقم السند / Receipt No.' : 'Receipt No.', String(data.receiptNumber)],
      [arabic ? 'رقم العملية / Transaction No.' : 'Transaction No.', String(data.transactionNumber)],
      [arabic ? 'التاريخ / Date' : 'Date', data.transactionDate.toISOString().slice(0, 10)],
      [arabic ? 'البيان / Description' : 'Description', data.description],
      [arabic ? 'الصندوق / Fund' : 'Fund', data.fundName],
      ...(data.personName ? ([[arabic ? 'الاسم / Name' : 'Name', data.personName]] as [string, string][]) : []),
      [arabic ? 'طريقة الدفع / Method' : 'Method', data.paymentMethod],
      [
        arabic ? 'المبلغ / Amount' : 'Amount',
        data.currency === 'IQD'
          ? `${formatAmount(data.amountIqd)} IQD`
          : `${formatAmount(data.amountOriginal)} ${data.currency} × ${data.exchangeRate} = ${formatAmount(data.amountIqd)} IQD`,
      ],
    ];

    doc.fontSize(11);
    for (const [label, value] of rows) {
      doc.text(`${label}: ${value}`, { align: 'right' });
      doc.moveDown(0.3);
    }

    // QR code (bottom-left)
    if (data.qrPngBuffer) {
      doc.image(data.qrPngBuffer, doc.page.margins.left, doc.page.height - 130, { width: 80 });
    }
    doc
      .fontSize(8)
      .text(
        `Issued ${data.issuedAt.toISOString()} — ${orgEn}`,
        doc.page.margins.left,
        doc.page.height - 60,
        { align: 'center' },
      );

    doc.end();
    return done;
  }
}

function formatAmount(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
