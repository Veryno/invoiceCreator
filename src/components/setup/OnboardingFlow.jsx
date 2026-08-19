import {
  ArrowLeft,
  ArrowRight,
  Buildings,
  Check,
  FileText,
  Receipt,
  UsersThree,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { AutosaveStatus } from "./SetupControls.jsx";
import { OnboardingCompanyStep } from "./OnboardingCompanyStep.jsx";
import { OnboardingCustomerStep } from "./OnboardingCustomerStep.jsx";
import { OnboardingDefaultsStep } from "./OnboardingDefaultsStep.jsx";
import { OnboardingReviewStep } from "./OnboardingReviewStep.jsx";
import { EMPTY_LIST, EMPTY_RECORD } from "./setupModel.js";
import "./setup.css";

const STEPS = [
  { label: "Company", Icon: Buildings },
  { label: "Invoice defaults", Icon: FileText },
  { label: "Customer", Icon: UsersThree },
  { label: "Review", Icon: Check },
];

function clampStep(value) {
  const numeric = Number.parseInt(value, 10);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(STEPS.length - 1, numeric)) : 0;
}

export function OnboardingFlow({
  step,
  initialStep = 0,
  company = EMPTY_RECORD,
  brandColor = "#0F766E",
  defaults = EMPTY_RECORD,
  templates = EMPTY_LIST,
  customer = EMPTY_RECORD,
  customerMode = "manual",
  customerImportSummary = "",
  customerImportError = "",
  isImportingCustomers = false,
  isSaving = false,
  savedAt = null,
  onStepChange,
  onUpdateCompany,
  onUpdateBrandColor,
  onUpdateDefaults,
  onCustomerModeChange,
  onUpdateCustomer,
  onImportCustomerFile,
  onSkipCustomer,
  onAutosave,
  onSkip,
  onComplete,
  onCreateInvoice,
}) {
  const [internalStep, setInternalStep] = useState(() => clampStep(initialStep));
  const [isFinishing, setIsFinishing] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const contentRef = useRef(null);
  const controlled = Number.isFinite(step);
  const activeStep = controlled ? clampStep(step) : internalStep;

  useEffect(() => {
    contentRef.current?.querySelector("[data-setup-step-title]")?.focus();
  }, [activeStep]);

  function moveTo(nextStep) {
    const safeStep = clampStep(nextStep);
    if (!controlled) setInternalStep(safeStep);
    onStepChange?.(safeStep);
    onAutosave?.({ section: "progress", step: safeStep });
  }

  async function finishSetup(createInvoice) {
    if (isFinishing) return;
    setIsFinishing(true);
    setCompletionError("");
    onAutosave?.({ section: "completion", step: activeStep, complete: true });
    try {
      if (createInvoice) await onCreateInvoice?.();
      else await onComplete?.();
    } catch (error) {
      setCompletionError(error?.message || "Setup could not be finished. Your entries are still saved; please try again.");
    } finally {
      setIsFinishing(false);
    }
  }

  async function skipSetup() {
    if (isFinishing) return;
    setIsFinishing(true);
    setCompletionError("");
    onAutosave?.({ section: "completion", step: activeStep, skipped: true });
    try {
      await onSkip?.({ step: activeStep });
    } catch (error) {
      setCompletionError(error?.message || "Setup could not be skipped. Please try again.");
    } finally {
      setIsFinishing(false);
    }
  }

  return (
    <main className="setup-onboarding" aria-labelledby="onboarding-page-title">
      <header className="setup-onboarding-header">
        <div className="setup-brand-lockup">
          <span><Receipt size={21} weight="fill" aria-hidden="true" /></span>
          <div>
            <strong>Invoice Studio</strong>
            <small id="onboarding-page-title">Quick setup</small>
          </div>
        </div>
        <div className="setup-onboarding-header-actions">
          <AutosaveStatus isSaving={isSaving} savedAt={savedAt} />
          <button className="setup-skip-button" type="button" disabled={isFinishing} onClick={skipSetup}>
            Skip setup
          </button>
        </div>
      </header>

      <div className="setup-onboarding-shell">
        <aside className="setup-progress" aria-label="Setup progress">
          <div className="setup-progress-intro">
            <p>First run</p>
            <h1>Start with the essentials</h1>
            <span>Four short steps. Leave anything blank and return from Settings whenever you like.</span>
          </div>
          <ol>
            {STEPS.map(({ label, Icon }, index) => {
              const isCurrent = activeStep === index;
              const isComplete = activeStep > index;
              return (
                <li key={label} className={isCurrent ? "is-current" : isComplete ? "is-complete" : ""}>
                  <button
                    type="button"
                    aria-current={isCurrent ? "step" : undefined}
                    onClick={() => moveTo(index)}
                  >
                    <span className="setup-progress-marker">
                      {isComplete ? <Check size={14} weight="bold" aria-hidden="true" /> : <Icon size={17} aria-hidden="true" />}
                    </span>
                    <span>
                      <small>Step {index + 1}</small>
                      <strong>{label}</strong>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="setup-progress-privacy">Your setup and invoices remain on this device.</p>
        </aside>

        <div className="setup-onboarding-content">
          <div className="setup-onboarding-scroll" ref={contentRef}>
            {activeStep === 0 ? (
              <OnboardingCompanyStep
                company={company}
                brandColor={brandColor}
                onUpdateCompany={onUpdateCompany}
                onUpdateBrandColor={onUpdateBrandColor}
                onAutosave={onAutosave}
              />
            ) : null}
            {activeStep === 1 ? (
              <OnboardingDefaultsStep
                defaults={defaults}
                templates={templates}
                onUpdateDefaults={onUpdateDefaults}
                onAutosave={onAutosave}
              />
            ) : null}
            {activeStep === 2 ? (
              <OnboardingCustomerStep
                customer={customer}
                mode={customerMode}
                onModeChange={onCustomerModeChange}
                onUpdateCustomer={onUpdateCustomer}
                onImportCustomerFile={onImportCustomerFile}
                onSkipCustomer={onSkipCustomer}
                onAutosave={onAutosave}
                isImporting={isImportingCustomers}
                importError={customerImportError}
                importSummary={customerImportSummary}
              />
            ) : null}
            {activeStep === 3 ? (
              <OnboardingReviewStep
                company={company}
                brandColor={brandColor}
                defaults={defaults}
                templates={templates}
                customer={customer}
                customerMode={customerMode}
                customerImportSummary={customerImportSummary}
                onEditStep={moveTo}
              />
            ) : null}
          </div>

          {completionError ? <p className="setup-completion-error" role="alert">{completionError}</p> : null}

          <footer className="setup-onboarding-footer">
            <button
              className="setup-button setup-button--secondary"
              type="button"
              disabled={activeStep === 0 || isFinishing}
              onClick={() => moveTo(activeStep - 1)}
            >
              <ArrowLeft size={17} aria-hidden="true" />
              Back
            </button>
            <span>Step {activeStep + 1} of {STEPS.length}</span>
            {activeStep < STEPS.length - 1 ? (
              <button className="setup-button setup-button--primary" type="button" disabled={isFinishing} onClick={() => moveTo(activeStep + 1)}>
                Continue
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            ) : (
              <div className="setup-finish-actions">
                <button className="setup-button setup-button--secondary" type="button" disabled={isFinishing} onClick={() => finishSetup(false)}>
                  {isFinishing ? "Finishing…" : "Finish setup"}
                </button>
                <button className="setup-button setup-button--primary" type="button" disabled={isFinishing} onClick={() => finishSetup(true)}>
                  {isFinishing ? "Creating…" : "Create first invoice"}
                  <ArrowRight size={17} aria-hidden="true" />
                </button>
              </div>
            )}
          </footer>
        </div>
      </div>
    </main>
  );
}
