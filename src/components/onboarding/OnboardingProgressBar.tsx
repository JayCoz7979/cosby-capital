"use client";

/**
 * OnboardingProgressBar — gold fill on navy background.
 * Shows step number, percentage fill, and step labels.
 */

interface OnboardingProgressBarProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export function OnboardingProgressBar({
  currentStep,
  totalSteps,
  stepLabels,
}: OnboardingProgressBarProps) {
  const pct = Math.round(((currentStep - 1) / totalSteps) * 100);

  return (
    <div className="space-y-2">
      {/* Step count + label */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-body text-gray-300">
          Step {currentStep} of {totalSteps}:{" "}
          <span className="text-[#C9A84C] font-medium">
            {stepLabels[currentStep - 1] ?? ""}
          </span>
        </span>
        <span className="text-sm font-body text-gray-400">{pct}%</span>
      </div>

      {/* Progress bar track */}
      <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full rounded-full bg-[#C9A84C] transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Onboarding progress: ${pct}%`}
        />
      </div>

      {/* Step dots */}
      <div className="flex justify-between mt-1">
        {stepLabels.map((label, idx) => {
          const stepNum = idx + 1;
          const isComplete = stepNum < currentStep;
          const isCurrent = stepNum === currentStep;
          return (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className={[
                  "w-2.5 h-2.5 rounded-full transition-colors",
                  isComplete
                    ? "bg-[#C9A84C]"
                    : isCurrent
                    ? "bg-[#C9A84C] ring-2 ring-[#C9A84C]/40"
                    : "bg-white/20",
                ].join(" ")}
              />
              <span
                className={[
                  "text-[10px] font-body hidden sm:block",
                  isComplete || isCurrent ? "text-[#C9A84C]" : "text-gray-500",
                ].join(" ")}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
