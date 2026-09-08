/**
 * Copy this file to personal.js and keep the copy private.
 * personal.js is ignored by git and is loaded only by your local extension.
 */
globalThis.LOCK_IN_PERSONAL_CONFIG = {
  schemaVersion: 1,
    displayName: "Ramya",
    arc: {
    name: "My Arc",
    start: "2026-09-07",
    end: "2026-12-31",
  },
  milestones: [
    {
      id: "example-milestone",
      label: "A meaningful day",
      date: "2026-10-01",
      preparationWindows: [
        {
          daysBefore: 14,
          tasks: ["Decide what would make this day meaningful."],
        },
        {
          daysBefore: 3,
          tasks: ["Finish the most important preparation."],
        },
        {
          daysBefore: 0,
          tasks: ["Be present and enjoy the day."],
        },
      ],
    },
  ],
  attentionDomains: [],
};
