// src/components/onboarding/Onboarding.tsx
import { useState, useEffect } from "react";
import { WelcomeStep } from "./WelcomeStep";
import { ContainerCheckStep } from "./ContainerCheckStep";
import { SidebarGuideStep } from "./SidebarGuideStep";

interface OnboardingProps {
  onComplete: () => void;
}

const TOTAL_STEPS = 3;

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [animationState, setAnimationState] = useState<"enter" | "active" | "exit">("enter");

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setAnimationState("active");
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const transitionTo = (nextStep: number | "complete") => {
    setAnimationState("exit");
    setTimeout(() => {
      if (nextStep === "complete") {
        onComplete();
      } else {
        setStep(nextStep);
        setAnimationState("enter");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setAnimationState("active");
          });
        });
      }
    }, 300);
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      transitionTo(step + 1);
    } else {
      transitionTo("complete");
    }
  };

  const handleSkip = () => {
    transitionTo("complete");
  };

  const stateClass =
    animationState === "enter"
      ? "onboarding-step-enter"
      : animationState === "active"
        ? "onboarding-step-active"
        : "onboarding-step-exit";

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="glass-card flex flex-col items-center gap-8 px-12 py-10">
        <div className={`onboarding-step ${stateClass}`}>
          {step === 0 && <WelcomeStep onNext={handleNext} onSkip={handleSkip} />}
          {step === 1 && <ContainerCheckStep onNext={handleNext} onSkip={handleSkip} />}
          {step === 2 && <SidebarGuideStep onFinish={handleNext} onSkip={handleSkip} />}
        </div>
        {/* Dot Indicator */}
        <div className="flex gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`onboarding-dot h-2 w-2 rounded-full ${
                i === step
                  ? "scale-125 bg-[var(--status-running-text)]"
                  : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
