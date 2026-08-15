import { useCallback, useEffect, useRef, useState } from 'react';
import { useOnboardingSeen } from '../hooks/useOnboardingSeen';

type Step = 'message-1' | 'message-2';

const MESSAGES: { lead: string; detail: string }[] = [
  {
    lead: 'Your data never leaves your browser.',
    detail:
      'We are not sending any of your investment information to backend servers. Only the name of the fund is being used to query its historical NAV value to do the calculation and comparison.',
  },
  {
    lead: 'We use free MFAPI.',
    detail:
      'To get the historical NAV values of funds, we are using the MFAPI. Being an open free API, it could be slow at times. Appreciate your patience with this.',
  },
];

const TRANSITION_MS = 200;

export function OnboardingPopup() {
  const { seen, markSeen } = useOnboardingSeen();
  const [step, setStep] = useState<Step | null>(null);
  const [visible, setVisible] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    markSeen();
    setVisible(false);
    window.setTimeout(() => setStep(null), TRANSITION_MS);
  }, [markSeen]);

  useEffect(() => {
    if (!seen) setStep('message-1');
  }, [seen]);

  useEffect(() => {
    if (step === null) return;
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, [step]);

  useEffect(() => {
    if (step !== null) buttonRef.current?.focus();
  }, [step]);

  useEffect(() => {
    if (step === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, close]);

  if (step === null) return null;

  function advance() {
    setStep('message-2');
  }

  const messageIndex = step === 'message-1' ? 0 : 1;

  return (
    <div
      className={`fixed inset-0 z-30 flex items-center justify-center bg-black/50 p-4 transition-opacity duration-200 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Welcome"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-lg border border-line bg-plate p-6 shadow-lg transition-all duration-200 ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div key={step} className="animate-[onboarding-content-in_200ms_ease-out]">
          <p className="text-center text-sm font-semibold text-ink">{MESSAGES[messageIndex].lead}</p>
          <p className="mt-1 text-sm text-ink-2">{MESSAGES[messageIndex].detail}</p>
        </div>

        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          <span className={`h-1.5 w-1.5 rounded-full ${messageIndex === 0 ? 'bg-acc' : 'bg-line'}`} />
          <span className={`h-1.5 w-1.5 rounded-full ${messageIndex === 1 ? 'bg-acc' : 'bg-line'}`} />
        </div>

        <div className="mt-4 flex justify-end">
          <button
            ref={buttonRef}
            type="button"
            onClick={step === 'message-1' ? advance : close}
            className="rounded-md border border-line bg-plate-2 px-3 py-1.5 text-sm font-medium text-ink hover:bg-acc-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc"
          >
            {step === 'message-1' ? 'Next' : 'I understand'}
          </button>
        </div>
      </div>
    </div>
  );
}
