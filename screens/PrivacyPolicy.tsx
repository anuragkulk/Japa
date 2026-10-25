import { useEffect } from "react";
import { AppBar, Screen, PageBody } from "@/components/shell";

const SECTIONS: { heading: string; paras: string[] }[] = [
  {
    heading: "What we collect",
    paras: [
      "Account details: the name, email address and password you choose when you sign up.",
      "What you record: japa counts and their dates, the names of the people you add, milestone names and targets, and the devotionals you create — typed text exactly as you enter it, plus the images you choose to upload.",
      "Sign-in state: a session token is kept in your browser or app storage so you stay signed in between visits.",
    ],
  },
  {
    heading: "How it is used",
    paras: [
      "Only to run the app: showing your own records, totalling progress toward your milestones, and listing the devotionals you have saved.",
      "Japa does not sell your data, show advertising, or share your devotional content with anyone.",
    ],
  },
  {
    heading: "What Japa does not do",
    paras: [
      "No analytics or tracking of your devotional life, and no third-party sign-in providers.",
      "No translation, transliteration, speech, optical character recognition or AI processing of your text or images. What you type is stored and displayed exactly as entered.",
    ],
  },
  {
    heading: "Where your data lives",
    paras: [
      "Records are kept in the app's hosted database and uploaded images in its hosted object storage, provided by the platform that serves this site. Nothing is written to your device beyond the session token.",
    ],
  },
  {
    heading: "Security and access",
    paras: [
      "Every request is checked against your sign-in, and each record is tied to your account, so other accounts cannot read, change or delete it.",
      "Passwords are stored salted and hashed, never in plain readable form, and are never displayed anywhere in the app.",
    ],
  },
  {
    heading: "Your control over the data",
    paras: [
      "You can edit or delete any record at any time from the app. Deleting a person removes their japa records, and deleting a devotional removes its images and text.",
      "There is no self-service account deletion yet; removing the last of your records leaves nothing personal stored for your account.",
    ],
  },
  {
    heading: "Families and children",
    paras: [
      "Japa is built for household devotional practice. Someone under 13 should set up an account with a parent or guardian.",
    ],
  },
  {
    heading: "Changes to this policy",
    paras: [
      "If this page changes, the date at the top and the page itself are updated. Continuing to use Japa after an update means accepting the revised policy.",
    ],
  },
];

export function PrivacyPolicy() {
  useEffect(() => {
    const previous = document.title;
    document.title = "Japa Privacy Policy";
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <Screen>
      <AppBar title="Japa Privacy Policy" showBack />
      <PageBody>
        <article className="rounded-2xl border border-border bg-card px-5 py-7 shadow-soft sm:px-8 sm:py-9">
          <p className="text-xs tracking-wide text-muted-foreground">
            Last updated: October 5, 2026
          </p>
          <p className="mt-4 text-[0.95rem] leading-7 text-foreground/85">
            Japa is a private devotional tracker for your family: japa counts, milestones and the
            devotionals you save. This page explains what the app stores, why, and what you can
            change or remove.
          </p>
          {SECTIONS.map((section) => (
            <section key={section.heading} className="mt-8">
              <h2 className="font-display text-xl font-semibold text-foreground">
                {section.heading}
              </h2>
              {section.paras.map((para) => (
                <p key={para} className="mt-2.5 text-[0.95rem] leading-7 text-foreground/85">
                  {para}
                </p>
              ))}
            </section>
          ))}
        </article>
        <footer className="mt-8 pt-4 text-center text-xs text-muted-foreground">
          <a
            href="/"
            className="font-medium text-foreground/70 underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            Back to Japa
          </a>
        </footer>
      </PageBody>
    </Screen>
  );
}
