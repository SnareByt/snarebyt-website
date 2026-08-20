'use client';

import { useRef, useState, useEffect } from 'react';

/**
 * Six boxes for a six-digit code.
 *
 * Split boxes rather than one field because the shape of the input tells you
 * how much to type before you start, and because a wrong digit is visible
 * where it happened.
 *
 * The details that make it feel right are all about not fighting the person:
 *
 *  - pasting the whole code into any box fills all six, which is what people
 *    actually do with a code from an email;
 *  - Backspace in an empty box steps back and clears the previous one, so
 *    correcting a typo is one gesture rather than two;
 *  - arrow keys move between boxes, because it looks like a row of fields and
 *    should behave like one;
 *  - it submits itself the moment the sixth digit lands. The code is either
 *    right or wrong; making someone reach for a button adds nothing.
 *
 * `inputMode="numeric"` and `autoComplete="one-time-code"` together are what
 * put the numeric keypad on a phone and let iOS and Android offer the code
 * straight from the notification.
 */
export function OtpInput({
  onComplete, disabled, invalid, resetKey = 0, autoFocus = true,
}: {
  onComplete: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  /**
   * Bumped by the parent on every rejection. A boolean cannot do this job:
   * the second wrong code leaves `invalid` true from the first, so the effect
   * never re-runs and the boxes keep the digits that just failed.
   */
  resetKey?: number;
  autoFocus?: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const fired = useRef(false);

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  // A rejected code clears itself and returns to the first box. Leaving the
  // wrong digits in place means the next attempt starts by deleting them.
  useEffect(() => {
    if (!resetKey) return;
    setDigits(Array(6).fill(''));
    fired.current = false;
    refs.current[0]?.focus();
  }, [resetKey]);

  function commit(next: string[]) {
    setDigits(next);
    const code = next.join('');
    if (code.length === 6 && !next.includes('') && !fired.current) {
      fired.current = true;
      onComplete(code);
    }
  }

  function setAt(i: number, value: string) {
    const only = value.replace(/\D/g, '');
    if (!only) {
      const next = [...digits];
      next[i] = '';
      commit(next);
      return;
    }
    // More than one digit means a paste (or a fast typist on a soft keyboard):
    // spread it across this box and the ones after it.
    const next = [...digits];
    for (let k = 0; k < only.length && i + k < 6; k++) next[i + k] = only[k];
    commit(next);
    const landed = Math.min(i + only.length, 5);
    refs.current[landed]?.focus();
    refs.current[landed]?.select();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = '';
      setDigits(next);
      fired.current = false;
      refs.current[i - 1]?.focus();
      return;
    }
    if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      refs.current[i - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && i < 5) {
      e.preventDefault();
      refs.current[i + 1]?.focus();
    }
  }

  return (
    <div className={`otp${invalid ? ' bad' : ''}`}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={d}
          onChange={(e) => setAt(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          // The paste handler is on every box so pasting into the middle of a
          // half-typed code still fills from the start of the pasted string.
          onPaste={(e) => {
            e.preventDefault();
            setAt(0, e.clipboardData.getData('text'));
          }}
          className={d ? 'filled' : ''}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={6}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of 6`}
        />
      ))}
    </div>
  );
}
