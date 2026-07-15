import { useState, type FormEvent } from "react";
import { Mail, MonitorPlay, Send, Check } from "lucide-react";
import { site } from "@/lib/site";

// Formspree endpoint: https://formspree.io/f/xdkrrloe (project: NextGenPlayz Contact)
const FORMSPREE_ID = "xdkrrloe";

type Status = "idle" | "loading" | "success" | "error";

export default function Contact() {
  const [status, setStatus] = useState<Status>("idle");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    const form = e.currentTarget;
    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: new FormData(form),
      });
      if (res.ok) {
        setStatus("success");
        form.reset();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="glass overflow-hidden rounded-2xl">
        <div className="h-px w-full bg-gradient-to-r from-transparent via-signal to-transparent" />
        <div className="p-8 sm:p-10">
          <a
            href={`mailto:${site.email}`}
            className="flex items-center gap-4 rounded-xl bg-white/[0.03] p-4 transition-colors hover:bg-signal-soft"
          >
            <Mail className="text-signal" size={22} />
            <div>
              <p className="font-display text-sm font-semibold text-ink">Email</p>
              <p className="text-sm text-ink-muted">{site.email}</p>
            </div>
          </a>
          <a
            href={site.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center gap-4 rounded-xl bg-white/[0.03] p-4 transition-colors hover:bg-signal-soft"
          >
            <MonitorPlay className="text-signal" size={22} />
            <div>
              <p className="font-display text-sm font-semibold text-ink">YouTube</p>
              <p className="text-sm text-ink-muted">{site.channelHandle}</p>
            </div>
          </a>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {/* SECURITY: honeypot spam trap. Real visitors never see or fill
                this field; Formspree silently drops any submission where it
                isn't empty. See the .form-honeypot rule in global.css. */}
            <input
              type="text"
              name="_gotcha"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
              className="form-honeypot"
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="contact-name" className="sr-only">
                  Your name
                </label>
                <input
                  required
                  id="contact-name"
                  name="name"
                  placeholder="Your name"
                  className="w-full rounded-lg border border-line bg-elevated px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-data"
                />
              </div>
              <div>
                <label htmlFor="contact-email" className="sr-only">
                  Your email
                </label>
                <input
                  required
                  type="email"
                  id="contact-email"
                  name="email"
                  placeholder="Your email"
                  className="w-full rounded-lg border border-line bg-elevated px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-data"
                />
              </div>
            </div>
            <div>
              <label htmlFor="contact-message" className="sr-only">
                Tell me about the project
              </label>
              <textarea
                required
                id="contact-message"
                name="message"
                rows={4}
                placeholder="Tell me about the project..."
                className="w-full rounded-lg border border-line bg-elevated px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-data"
              />
            </div>
            <button
              type="submit"
              disabled={status === "loading"}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-signal px-6 py-3.5 font-display text-sm font-semibold uppercase tracking-wide text-white transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {status === "success" ? (
                <>
                  <Check size={18} /> Sent
                </>
              ) : (
                <>
                  <Send size={16} /> {status === "loading" ? "Sending..." : "Send Message"}
                </>
              )}
            </button>
            {status === "error" && (
              <p className="text-center text-xs text-signal">
                Something went wrong — email {site.email} directly for now.
              </p>
            )}
            {/* Screen-reader-only announcement of the submit result. The
                visual states above already cover sighted users; this
                mirrors them via aria-live so the outcome isn't silent
                for screen reader users too. */}
            <p aria-live="polite" role="status" className="sr-only">
              {status === "loading" && "Sending your message…"}
              {status === "success" && "Message sent successfully."}
              {status === "error" &&
                `Something went wrong. Please email ${site.email} directly.`}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
