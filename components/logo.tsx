import { cn } from '@/lib/utils';

/** Loudloop mark: a loop (the conveyor) around rising bars (getting louder) in platform colors. */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn('shrink-0', className)} aria-hidden>
      <rect width="40" height="40" rx="8" fill="#141414" />
      <path d="M31.5 14.5A13 13 0 1 0 33 20" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M33.6 10.4 31.9 15.2 27.1 13.6" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="13" y="20" width="3.6" height="7" rx="1.8" fill="#2F86DE" />
      <rect x="18.2" y="16.5" width="3.6" height="10.5" rx="1.8" fill="#D9409F" />
      <rect x="23.4" y="13" width="3.6" height="14" rx="1.8" fill="#D97A12" />
    </svg>
  );
}
