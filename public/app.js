(function () {
  const forms = document.querySelectorAll("[data-waitlist-form]");

  forms.forEach((form) => {
    form.noValidate = true;
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submitForm(form);
    });

    const reset = form.querySelector("[data-reset]");
    if (reset) {
      reset.addEventListener("click", () => {
        const fields = form.querySelector("[data-fields]");
        const success = form.querySelector("[data-success]");
        fields.hidden = false;
        success.hidden = true;
        const email = form.querySelector('input[name="email"]');
        if (email) email.focus();
      });
    }
  });

  function clearErrors(form) {
    const banner = form.querySelector("[data-banner]");
    banner.hidden = true;
    banner.textContent = "";
    form.querySelectorAll("[data-error-for]").forEach((node) => {
      node.hidden = true;
      node.textContent = "";
    });
    form.querySelectorAll("[aria-invalid='true']").forEach((node) => {
      node.removeAttribute("aria-invalid");
    });
  }

  function reveal(node) {
    if (!node) return;
    const header = document.querySelector(".site-header");
    const offset = (header ? header.getBoundingClientRect().bottom : 0) + 16;
    const rect = node.getBoundingClientRect();
    if (rect.top < offset) {
      window.scrollBy(0, rect.top - offset);
    } else if (rect.bottom > window.innerHeight - 16) {
      window.scrollBy(0, rect.bottom - window.innerHeight + 16);
    }
  }

  function showErrors(form, message, errors) {
    const banner = form.querySelector("[data-banner]");
    banner.textContent =
      message || "Check the form and try again.";
    banner.hidden = false;
    if (errors && typeof errors === "object") {
      Object.entries(errors).forEach(([name, text]) => {
        if (typeof text !== "string" || !text) return;
        const node = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
        const field = form.querySelector(`[name="${CSS.escape(name)}"]`);
        if (node) {
          node.textContent = text;
          node.hidden = false;
        }
        if (field) field.setAttribute("aria-invalid", "true");
      });
    }
    const firstInvalid = form.querySelector("[aria-invalid='true']");
    if (firstInvalid) firstInvalid.focus({ preventScroll: true });
    else banner.focus({ preventScroll: true });
    reveal(banner);
  }

  function clientErrors(payload) {
    const errors = {};
    const email = String(payload.email || "").trim();
    if (!email) errors.email = "Enter your work email.";
    else if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "That email does not look complete.";
    }
    return errors;
  }

  async function submitForm(form) {
    if (form.dataset.submitting === "true") return;
    clearErrors(form);

    const data = new FormData(form);
    const payload = {
      email: data.get("email") ?? "",
      name: data.get("name") ?? "",
      company: data.get("company") ?? "",
      country: data.get("country") ?? "",
      mode: data.get("mode") ?? "",
      qp_leave_blank: data.get("qp_leave_blank") ?? "",
    };

    const localErrors = clientErrors(payload);
    if (Object.keys(localErrors).length > 0) {
      showErrors(form, "Check the form and try again.", localErrors);
      return;
    }

    const button = form.querySelector("[type='submit']");
    const idleLabel = button.textContent;
    form.dataset.submitting = "true";
    button.disabled = true;
    button.textContent = "Sending...";
    form.setAttribute("aria-busy", "true");

    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      let body = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }

      if (response.ok && body && body.ok === true) {
        const success = form.querySelector("[data-success]");
        const message = form.querySelector("[data-success-message]");
        const title = form.querySelector("[data-success-title]");
        message.textContent =
          body.message || "You are on the pilot waitlist. We will write to the work email you gave.";
        form.querySelector("[data-fields]").hidden = true;
        success.hidden = false;
        title.focus({ preventScroll: true });
        reveal(success);
        return;
      }

      showErrors(
        form,
        (body && body.message) ||
          "We could not save your details. Try again, or email cathal@autopilotconsultants.com.",
        body && body.errors,
      );
    } catch {
      showErrors(
        form,
        "We could not reach the waitlist. Try again, or email cathal@autopilotconsultants.com.",
      );
    } finally {
      form.dataset.submitting = "false";
      button.disabled = false;
      button.textContent = idleLabel;
      form.removeAttribute("aria-busy");
    }
  }
})();
