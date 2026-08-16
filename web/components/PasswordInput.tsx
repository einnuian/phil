"use client";

import { useState } from "react";

/**
 * A password field with a show/hide toggle.
 *
 * Every prop but `type` passes straight through to the input, so callers keep
 * their own sizing and `autoComplete` — the field styling differs between the
 * login card and the account menu, and this shouldn't flatten that.
 *
 * Margins belong on `wrapperClassName`, not `className`: the toggle is centred
 * against the wrapper, so a margin on the input itself would push it off by
 * half the gap.
 */
export default function PasswordInput({
  className = "",
  wrapperClassName = "",
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & {
  wrapperClassName?: string;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative ${wrapperClassName}`}>
      {/* pr-9 keeps the text clear of the button rather than running under it. */}
      <input {...props} type={visible ? "text" : "password"} className={`${className} pr-9`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // The field is already labelled; announce what this button does instead.
        aria-label={visible ? "Hide password" : "Show password"}
        // Skipped in tab order: reaching it between the password and the submit
        // button is a nuisance for anyone typing a password normally.
        tabIndex={-1}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:text-slate-700"
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10.7 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.4 3.4M6.6 6.6A18.4 18.4 0 0 0 2 12s3.6 7 10 7a10.4 10.4 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
