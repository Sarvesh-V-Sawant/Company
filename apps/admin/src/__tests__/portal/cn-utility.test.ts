/**
 * @jest-environment node
 */
import { cn } from '@lib/utils/cn';

describe('cn utility', () => {
  it('returns single class unchanged', () => {
    expect(cn('bg-blue-600')).toBe('bg-blue-600');
  });

  it('joins multiple classes', () => {
    expect(cn('flex', 'items-center', 'gap-2')).toBe('flex items-center gap-2');
  });

  it('deduplicates conflicting tailwind classes (last wins)', () => {
    // tailwind-merge resolves bg conflicts
    expect(cn('bg-red-500', 'bg-blue-600')).toBe('bg-blue-600');
    expect(cn('p-4', 'px-6')).toBe('p-4 px-6');
  });

  it('handles conditional classes via object syntax', () => {
    const isError = true;
    const result = cn('border', { 'border-red-500': isError, 'border-gray-300': !isError });
    expect(result).toContain('border-red-500');
    expect(result).not.toContain('border-gray-300');
  });

  it('handles false / undefined / null gracefully', () => {
    expect(cn('flex', undefined, null as unknown as string, false as unknown as string, 'gap-2')).toBe('flex gap-2');
  });

  it('handles array of classes', () => {
    expect(cn(['flex', 'items-center'])).toBe('flex items-center');
  });

  it('handles nested arrays', () => {
    expect(cn([['flex', 'items-center'], 'gap-2'])).toBe('flex items-center gap-2');
  });

  it('resolves text-size conflicts', () => {
    expect(cn('text-sm', 'text-base')).toBe('text-base');
  });

  it('works with empty input', () => {
    expect(cn()).toBe('');
  });

  it('trims extra whitespace from combined classes', () => {
    const result = cn('flex   ', '  items-center');
    expect(result).not.toMatch(/\s{2,}/);
  });
});
