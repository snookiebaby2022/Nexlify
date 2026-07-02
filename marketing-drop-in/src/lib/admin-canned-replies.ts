export type CannedReply = {
  id: string;
  label: string;
  body: string;
};

export const CANNED_REPLIES: CannedReply[] = [
  {
    id: "thanks",
    label: "Thanks + investigating",
    body: "Thanks for reaching out. We're looking into this and will get back to you shortly.",
  },
  {
    id: "license-reset",
    label: "License machine reset",
    body: "We've cleared the machine binding on your license. Please deactivate on the old server (if possible) and activate again on your new machine.",
  },
  {
    id: "trial-info",
    label: "Trial info",
    body: "Your 7-day trial is tied to one account. If you need another trial for testing, let us know your use case and we can reset eligibility.",
  },
  {
    id: "install-help",
    label: "Install docs",
    body: "Please see our install guide at https://nexlify.live/install — if you're stuck on a specific step, reply with your OS and any error messages.",
  },
  {
    id: "closed-resolved",
    label: "Resolved / closing",
    body: "Glad we could help! We're marking this ticket as resolved. Reply here anytime if you need further assistance.",
  },
];
