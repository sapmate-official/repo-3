import { describe, expect, it } from 'vitest';
import {
  createBankDetailsSchema,
  updateBankDetailsSchema,
  upsertBankDetailsSchema,
  userIdParamSchema,
  bankUserOrIdParamSchema,
  listBankDetailsQuerySchema
} from '../../src/modules/bank/bank.schema.js';

describe('BankDetails Schemas', () => {
  describe('createBankDetailsSchema', () => {
    it('validates a correct bank details payload and normalizes IFSC to uppercase', () => {
      const valid = {
        userId: 'user-123',
        accountHolder: 'Alice Sharma',
        accountNumber: '123456789012',
        ifscCode: 'sbin0001234',
        bankName: 'State Bank of India'
      };

      const parsed = createBankDetailsSchema.parse(valid);
      expect(parsed.userId).toBe('user-123');
      expect(parsed.accountHolder).toBe('Alice Sharma');
      expect(parsed.ifscCode).toBe('SBIN0001234');
      expect(parsed.accountNumber).toBe('123456789012');

      const upsertParsed = upsertBankDetailsSchema.parse(valid);
      expect(upsertParsed.ifscCode).toBe('SBIN0001234');
    });

    it('rejects invalid IFSC code format', () => {
      const invalid = {
        userId: 'user-123',
        accountHolder: 'Alice Sharma',
        accountNumber: '123456789012',
        ifscCode: '1234INVALID',
        bankName: 'State Bank of India'
      };

      expect(() => createBankDetailsSchema.parse(invalid)).toThrow();
    });

    it('rejects account number with less than 9 digits', () => {
      const invalid = {
        userId: 'user-123',
        accountHolder: 'Alice Sharma',
        accountNumber: '12345',
        ifscCode: 'SBIN0001234',
        bankName: 'State Bank of India'
      };

      expect(() => createBankDetailsSchema.parse(invalid)).toThrow();
    });

    it('rejects account number with more than 18 digits or letters', () => {
      const invalid = {
        userId: 'user-123',
        accountHolder: 'Alice Sharma',
        accountNumber: '12345678901234567890',
        ifscCode: 'SBIN0001234',
        bankName: 'State Bank of India'
      };

      expect(() => createBankDetailsSchema.parse(invalid)).toThrow();
    });

    it('rejects missing or empty required fields', () => {
      expect(() =>
        createBankDetailsSchema.parse({
          userId: '',
          accountHolder: '',
          accountNumber: '',
          ifscCode: '',
          bankName: ''
        })
      ).toThrow();
    });
  });

  describe('updateBankDetailsSchema', () => {
    it('accepts partial updates', () => {
      const valid = {
        accountHolder: 'Alice B. Sharma',
        bankName: 'HDFC Bank'
      };

      const parsed = updateBankDetailsSchema.parse(valid);
      expect(parsed.accountHolder).toBe('Alice B. Sharma');
      expect(parsed.bankName).toBe('HDFC Bank');
      expect(parsed.accountNumber).toBeUndefined();
    });

    it('validates IFSC and account number when provided in update', () => {
      const valid = {
        ifscCode: 'hdfc0000001'
      };
      const parsed = updateBankDetailsSchema.parse(valid);
      expect(parsed.ifscCode).toBe('HDFC0000001');

      expect(() =>
        updateBankDetailsSchema.parse({
          accountNumber: 'bad-number'
        })
      ).toThrow();
    });
  });

  describe('param and query schemas', () => {
    it('validates userIdParamSchema', () => {
      expect(userIdParamSchema.parse({ userId: 'u-123' })).toEqual({ userId: 'u-123' });
      expect(() => userIdParamSchema.parse({ userId: '' })).toThrow();
    });

    it('validates bankUserOrIdParamSchema', () => {
      expect(bankUserOrIdParamSchema.parse({ id: 'rec-123' })).toEqual({ id: 'rec-123' });
      expect(() => bankUserOrIdParamSchema.parse({ id: '' })).toThrow();
    });

    it('applies default pagination in listBankDetailsQuerySchema', () => {
      const query = listBankDetailsQuerySchema.parse({});
      expect(query.page).toBe(1);
      expect(query.limit).toBe(50);
    });
  });
});
