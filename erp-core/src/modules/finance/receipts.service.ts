import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import * as QRCode from 'qrcode';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { PDF_RENDERER } from './pdf/pdf.tokens';
import { PdfRenderer } from './pdf/pdf-renderer.interface';

/** QR payload embedded in every receipt (ADR-020). Pure and unit-tested. */
export function buildQrPayload(input: {
  receiptNumber: number;
  transactionNumber: number;
  amountIqd: number;
  date: string;
}): string {
  return JSON.stringify({
    v: 1,
    rn: input.receiptNumber,
    tn: input.transactionNumber,
    iqd: input.amountIqd,
    d: input.date,
  });
}

/**
 * Receipt issuance (FRS-002 sanadat). One receipt per transaction; APPROVED
 * transactions only. The PDF is rendered via the PdfRenderer abstraction,
 * stored in MinIO through the Storage module, and linked from the receipt row.
 */
@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
    @Inject(PDF_RENDERER) private readonly pdf: PdfRenderer,
  ) {}

  async issueForTransaction(transactionId: string, actorId: string) {
    const tx = await this.prisma.financialTransaction.findUnique({
      where: { id: transactionId },
      include: { fund: true, receipt: true },
    });
    if (!tx) throw new NotFoundException('Transaction not found');
    const t = tx as {
      id: string;
      transactionNumber: number;
      type: string;
      status: string;
      description: string;
      currency: string;
      amountOriginal: unknown;
      exchangeRate: unknown;
      amountIqd: unknown;
      paymentMethod: string;
      transactionDate: Date;
      personId: string | null;
      fund: { name: string };
      receipt: { id: string } | null;
    };
    if (t.status !== 'APPROVED') {
      throw new BadRequestException('Receipts can only be issued for APPROVED transactions');
    }
    if (t.receipt) throw new BadRequestException('A receipt already exists for this transaction');

    const receiptType = t.type === 'EXPENSE' ? 'PAYMENT_VOUCHER' : 'RECEIPT';

    // Create the row first to obtain the sequential receipt number.
    const receipt = await this.prisma.receipt.create({
      data: { type: receiptType, transactionId: t.id, qrPayload: '', issuedBy: actorId },
    });
    const r = receipt as { id: string; receiptNumber: number; issuedAt: Date };

    const qrPayload = buildQrPayload({
      receiptNumber: r.receiptNumber,
      transactionNumber: t.transactionNumber,
      amountIqd: Number(t.amountIqd),
      date: t.transactionDate.toISOString().slice(0, 10),
    });
    const qrPngBuffer = await QRCode.toBuffer(qrPayload, { width: 200 });

    let personName: string | undefined;
    if (t.personId) {
      const person = await this.prisma.person.findUnique({
        where: { id: t.personId },
        select: { fullName: true },
      });
      personName = (person as { fullName: string } | null)?.fullName;
    }

    const pdfBuffer = await this.pdf.renderReceipt({
      receiptNumber: r.receiptNumber,
      receiptType,
      transactionNumber: t.transactionNumber,
      transactionType: t.type,
      description: t.description,
      amountIqd: Number(t.amountIqd),
      currency: t.currency,
      amountOriginal: Number(t.amountOriginal),
      exchangeRate: Number(t.exchangeRate),
      fundName: t.fund.name,
      personName,
      paymentMethod: t.paymentMethod,
      transactionDate: t.transactionDate,
      issuedAt: r.issuedAt,
      qrPngBuffer,
    });

    const file = await this.storage.upload({
      fileName: `receipt-${r.receiptNumber}.pdf`,
      mimeType: 'application/pdf',
      buffer: pdfBuffer,
      module: 'finance',
      uploadedBy: actorId,
    });

    const updated = await this.prisma.receipt.update({
      where: { id: r.id },
      data: { qrPayload, pdfFileId: (file as { id: string }).id },
    });

    await this.audit.log({
      userId: actorId,
      action: 'CREATE',
      module: 'finance',
      entityType: 'Receipt',
      entityId: r.id,
      newValue: { receiptNumber: r.receiptNumber, transactionId: t.id, type: receiptType },
    });

    return updated;
  }
}
