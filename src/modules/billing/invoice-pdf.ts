export interface InvoicePdfParams {
  invoiceNumber: string;
  orgName: string;
  orgAddress?: string | null;
  monthName: string;
  year: number;
  issueDate: string;
  dueDate: string;
  status: string;
  paidDate?: string | null;
  paymentReference?: string | null;
  planName: string;
  activeUsers: number;
  pricePerUser: number;
  totalAmount: number;
}

export function createInvoicePdfBuffer(params: InvoicePdfParams): Buffer {
  const sanitize = (text: string): string => text.replace(/[()\\]/g, '');

  const lines = [
    `BT /F1 22 Tf 50 740 Td (INVOICE) Tj ET`,
    `BT /F1 10 Tf 50 720 Td (Invoice #: ${sanitize(params.invoiceNumber)}) Tj ET`,
    `BT /F1 10 Tf 50 705 Td (Issued: ${sanitize(params.issueDate)}) Tj ET`,
    `BT /F1 10 Tf 50 690 Td (Due Date: ${sanitize(params.dueDate)}) Tj ET`,
    `BT /F1 14 Tf 50 650 Td (Billed To:) Tj ET`,
    `BT /F1 11 Tf 50 635 Td (${sanitize(params.orgName)}) Tj ET`,
    params.orgAddress ? `BT /F1 9 Tf 50 620 Td (${sanitize(params.orgAddress)}) Tj ET` : '',
    `BT /F1 14 Tf 50 580 Td (Subscription Details) Tj ET`,
    `BT /F1 10 Tf 50 560 Td (Plan: ${sanitize(params.planName)}) Tj ET`,
    `BT /F1 10 Tf 50 545 Td (Billing Period: ${sanitize(params.monthName)} ${params.year}) Tj ET`,
    `BT /F1 10 Tf 50 530 Td (Active Users: ${params.activeUsers}) Tj ET`,
    `BT /F1 10 Tf 50 515 Td (Price Per User: $${params.pricePerUser.toFixed(2)}) Tj ET`,
    `BT /F1 14 Tf 50 470 Td (Payment Summary) Tj ET`,
    `BT /F1 11 Tf 50 450 Td (Status: ${sanitize(params.status)}) Tj ET`,
    params.paidDate ? `BT /F1 10 Tf 50 435 Td (Paid Date: ${sanitize(params.paidDate)}) Tj ET` : '',
    params.paymentReference ? `BT /F1 10 Tf 50 420 Td (Reference: ${sanitize(params.paymentReference)}) Tj ET` : '',
    `BT /F1 16 Tf 50 370 Td (Total Amount: $${params.totalAmount.toFixed(2)}) Tj ET`,
    `BT /F1 9 Tf 50 320 Td (Thank you for your business! Contact support@alkaa.com for questions.) Tj ET`
  ].filter(Boolean).join('\n');

  const streamLength = Buffer.byteLength(lines, 'utf-8');

  const obj1 = '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n';
  const obj2 = '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n';
  const obj3 = '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n';
  const obj4 = `4 0 obj\n<< /Length ${streamLength} >>\nstream\n${lines}\nendstream\nendobj\n`;
  const obj5 = '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n';

  const header = '%PDF-1.4\n';
  const offset0 = 0;
  const offset1 = Buffer.byteLength(header, 'utf-8');
  const offset2 = offset1 + Buffer.byteLength(obj1, 'utf-8');
  const offset3 = offset2 + Buffer.byteLength(obj2, 'utf-8');
  const offset4 = offset3 + Buffer.byteLength(obj3, 'utf-8');
  const offset5 = offset4 + Buffer.byteLength(obj4, 'utf-8');

  const pad = (n: number) => n.toString().padStart(10, '0');

  const startXref = offset5 + Buffer.byteLength(obj5, 'utf-8');
  const xref = [
    'xref',
    '0 6',
    `${pad(offset0)} 65535 f `,
    `${pad(offset1)} 00000 n `,
    `${pad(offset2)} 00000 n `,
    `${pad(offset3)} 00000 n `,
    `${pad(offset4)} 00000 n `,
    `${pad(offset5)} 00000 n `,
    'trailer',
    '<< /Size 6 /Root 1 0 R >>',
    'startxref',
    startXref.toString(),
    '%%EOF'
  ].join('\n');

  const fullPdf = `${header}${obj1}${obj2}${obj3}${obj4}${obj5}${xref}`;
  return Buffer.from(fullPdf, 'utf-8');
}
