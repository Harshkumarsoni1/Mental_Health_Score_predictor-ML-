(() => {
  "use strict";

  const API_BASE = "http://127.0.0.1:8000";
  const RING_CIRCUMFERENCE = 2 * Math.PI * 96; // matches r=96 in the SVG

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const resetBtn = document.getElementById("reset-btn");
  const errorRetryBtn = document.getElementById("error-retry-btn");

  const signalPanel = document.querySelector(".signal-panel");
  const ringFill = document.getElementById("ring-fill");
  const scoreNumberEl = document.getElementById("score-number");
  const scoreMaxEl = document.getElementById("score-max");
  const signalLabelEl = document.getElementById("signal-label");
  const signalCopyEl = document.getElementById("signal-copy");

  ringFill.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  ringFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE);

  // ---------------------------------------------------------
  // Segmented control (stress_level) wiring
  // ---------------------------------------------------------
  const segGroup = document.getElementById("stress_level_group");
  const stressHiddenInput = document.getElementById("stress_level");
  segGroup.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      segGroup.querySelectorAll(".seg-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      stressHiddenInput.value = btn.dataset.value;
      clearFieldError(stressHiddenInput);
    });
  });

  // ---------------------------------------------------------
  // Field-level error helpers
  // ---------------------------------------------------------
  function fieldWrapper(input) {
    return input.closest(".field");
  }

  function setFieldError(input, message) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.add("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = message;
  }

  function clearFieldError(input) {
    const wrap = fieldWrapper(input);
    if (!wrap) return;
    wrap.classList.remove("field-error");
    const msgEl = wrap.querySelector(".error-msg");
    if (msgEl) msgEl.textContent = "";
  }

  function clearAllErrors() {
    form.querySelectorAll(".field").forEach((f) => f.classList.remove("field-error"));
    form.querySelectorAll(".error-msg").forEach((m) => (m.textContent = ""));
  }

  // ---------------------------------------------------------
  // Client-side validation mirroring the StudentData model
  // ---------------------------------------------------------
  function validate(payload) {
    const errors = [];

    const numericChecks = [
      ["age", 10, 100],
      ["avg_daily_usage_hours", 0, 24],
      ["daily_unlocks", 0, Infinity],
      ["study_hours", 0, 24],
      ["physical_activity_hours", 0, 24],
      ["sleep_hours_per_night", 0, 24],
    ];

    numericChecks.forEach(([key, min, max]) => {
      const input = document.getElementById(key);
      const val = payload[key];
      if (val === "" || val === null || Number.isNaN(val)) {
        errors.push([input, "This field is required."]);
      } else if (val < min || val > max) {
        errors.push([input, `Must be between ${min} and ${max === Infinity ? "0+" : max}.`]);
      }
    });

    ["gender", "country", "academic_level", "most_used_platform", "purpose_of_use"].forEach((key) => {
      const input = document.getElementById(key);
      if (!payload[key] || String(payload[key]).trim() === "") {
        errors.push([input, "This field is required."]);
      }
    });

    if (!payload.stress_level) {
      errors.push([stressHiddenInput, "Pick how your stress feels."]);
    }

    return errors;
  }

  // ---------------------------------------------------------
  // Gather form data into the exact StudentData shape
  // ---------------------------------------------------------
  function collectPayload() {
    const fd = new FormData(form);
    return {
      age: fd.get("age") === "" ? NaN : parseInt(fd.get("age"), 10),
      gender: fd.get("gender") || "",
      country: (fd.get("country") || "").trim(),
      academic_level: fd.get("academic_level") || "",
      most_used_platform: fd.get("most_used_platform") || "",
      purpose_of_use: fd.get("purpose_of_use") || "",
      avg_daily_usage_hours: fd.get("avg_daily_usage_hours") === "" ? NaN : parseFloat(fd.get("avg_daily_usage_hours")),
      daily_unlocks: fd.get("daily_unlocks") === "" ? NaN : parseInt(fd.get("daily_unlocks"), 10),
      study_hours: fd.get("study_hours") === "" ? NaN : parseFloat(fd.get("study_hours")),
      physical_activity_hours: fd.get("physical_activity_hours") === "" ? NaN : parseFloat(fd.get("physical_activity_hours")),
      sleep_hours_per_night: fd.get("sleep_hours_per_night") === "" ? NaN : parseFloat(fd.get("sleep_hours_per_night")),
      stress_level: fd.get("stress_level") || "",
    };
  }

  // ---------------------------------------------------------
  // Signal panel state switching
  // ---------------------------------------------------------
  function setSignalState(name) {
    signalPanel.classList.remove("is-idle", "is-loading", "is-result", "is-error", "band-strong", "band-balanced", "band-strained");
    signalPanel.classList.add(`is-${name}`);
    resetBtn.hidden = name !== "result";
    errorRetryBtn.hidden = name !== "error";
  }

  function setSubmitting(isSubmitting) {
    submitBtn.disabled = isSubmitting;
    submitBtn.classList.toggle("loading", isSubmitting);
  }

  function bandFor(score) {
    if (score < 4) {
      return {
        key: "strained",
        label: "Signal: strained",
        context: "Your answers point to real strain right now. Small shifts in sleep or screen time can move this more than they seem like they would.",
      };
    }
    if (score < 7) {
      return {
        key: "balanced",
        label: "Signal: balanced",
        context: "Your rhythm looks fairly steady, with room to recover and reset where you can.",
      };
    }
    return {
      key: "strong",
      label: "Signal: strong",
      context: "Your habits point to a well-supported, resilient baseline. Keep it up.",
    };
  }

  function animateCount(target, duration = 900) {
    if (prefersReducedMotion) {
      scoreNumberEl.textContent = target.toFixed(2);
      return;
    }
    const start = performance.now();
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      scoreNumberEl.textContent = (target * eased).toFixed(2);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderResult(score) {
    const clamped = Math.max(0, Math.min(10, score));
    const { key, label, context } = bandFor(clamped);

    scoreMaxEl.hidden = false;
    animateCount(clamped);
    signalLabelEl.textContent = label;
    signalCopyEl.textContent = context;

    setSignalState("result");
    signalPanel.classList.add(`band-${key}`);

    const offset = RING_CIRCUMFERENCE * (1 - clamped / 10);
    if (prefersReducedMotion) {
      ringFill.style.transition = "none";
    }
    requestAnimationFrame(() => {
      ringFill.style.strokeDashoffset = String(offset);
    });
  }

  function renderError(label, copy) {
    signalLabelEl.textContent = label;
    signalCopyEl.textContent = copy;
    scoreNumberEl.textContent = "—";
    scoreMaxEl.hidden = true;
    setSignalState("error");
  }

  // ---------------------------------------------------------
  // Parse FastAPI / Pydantic 422 error responses into
  // field-level messages where possible
  // ---------------------------------------------------------
  function applyServerValidationErrors(detail) {
    if (!Array.isArray(detail)) return false;
    let matched = false;
    detail.forEach((err) => {
      const field = Array.isArray(err.loc) ? err.loc[err.loc.length - 1] : null;
      const input = field ? document.getElementById(field) : null;
      const target = field === "stress_level" ? stressHiddenInput : input;
      if (target) {
        setFieldError(target, err.msg || "Invalid value.");
        matched = true;
      }
    });
    return matched;
  }

  // ---------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const payload = collectPayload();
    const clientErrors = validate(payload);

    if (clientErrors.length > 0) {
      clientErrors.forEach(([input, msg]) => input && setFieldError(input, msg));
      clientErrors[0][0]?.focus?.();
      return;
    }

    setSubmitting(true);
    setSignalState("loading");
    signalLabelEl.textContent = "Reading the signal…";
    signalCopyEl.textContent = "Running your habits through the model.";
    scoreNumberEl.textContent = "—";
    scoreMaxEl.hidden = true;

    try {
      const res = await fetch(`${API_BASE}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.status === 422) {
        const body = await res.json().catch(() => null);
        const matched = body && applyServerValidationErrors(body.detail);
        renderError(
          "Check your inputs",
          matched
            ? "The API rejected a few fields — details are marked on the form."
            : "The API rejected this submission. Please review your inputs and try again."
        );
        return;
      }

      if (!res.ok) {
        let detailMsg = `The API responded with status ${res.status}.`;
        const body = await res.json().catch(() => null);
        if (body && typeof body.detail === "string") detailMsg = body.detail;
        renderError("Prediction failed", detailMsg);
        return;
      }

      const data = await res.json();
      if (typeof data.predicted_mental_health_score !== "number") {
        renderError("Unexpected response", "The API responded, but the score was missing or malformed.");
        return;
      }

      renderResult(data.predicted_mental_health_score);
    } catch (err) {
      renderError(
        "Can't reach the server",
        `Couldn't connect to ${API_BASE}. Make sure the backend is running (uvicorn main:app --reload) and reachable from this page.`
      );
    } finally {
      setSubmitting(false);
    }
  });

  // live-clear errors as the user edits
  form.querySelectorAll("input, select").forEach((el) => {
    el.addEventListener("input", () => clearFieldError(el));
    el.addEventListener("change", () => clearFieldError(el));
  });

  function resetToIdle() {
    setSignalState("idle");
    signalLabelEl.textContent = "Waiting on your answers";
    signalCopyEl.textContent = "Fill in the form — the signal fills in once you submit it.";
    scoreNumberEl.textContent = "—";
    scoreMaxEl.hidden = true;
    ringFill.style.transition = "none";
    ringFill.style.strokeDashoffset = String(RING_CIRCUMFERENCE);
    requestAnimationFrame(() => { ringFill.style.transition = ""; });
  }

  resetBtn.addEventListener("click", resetToIdle);
  errorRetryBtn.addEventListener("click", resetToIdle);

  setSignalState("idle");
})();
