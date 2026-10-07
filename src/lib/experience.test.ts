import { describe, expect, it } from "vitest";

import {
  countCompanies,
  formatDuration,
  groupByCompany,
  parsePeriod,
  periodBounds,
  totalExperienceMonths
} from "./experience";

const role = (r: { company: string; date: string; role: string; location?: string }) => ({
  location: "Bangalore",
  ...r
});

const returning = [
  role({ company: "Acme", date: "2025 – Present", role: "Staff" }),
  role({ company: "Other", date: "2023 – 2025", role: "Senior" }),
  role({ company: "Acme", date: "2020 – 2023", role: "Junior" })
];

describe("groupByCompany", () => {
  it("keeps one entry per role when companies differ", () => {
    const groups = groupByCompany([
      role({
        company: "MedMe",
        date: "December 2025 – Present",
        role: "SE II",
        location: "Canada"
      }),
      role({ company: "Samsung", date: "December 2021 – August 2022", role: "Intern" })
    ]);
    expect(groups.map(g => g.company)).toEqual(["MedMe", "Samsung"]);
    expect(groups.map(g => g.roles.length)).toEqual([1, 1]);
  });

  it("folds consecutive roles at the same company into one stint", () => {
    const groups = groupByCompany([
      role({ company: "HyperVerge", date: "April 2025 – December 2025", role: "SDE 2" }),
      role({ company: "HyperVerge", date: "July 2023 – March 2025", role: "SDE 1" }),
      role({ company: "HyperVerge", date: "August 2022 – June 2023", role: "Intern" })
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].roles.map(r => r.role)).toEqual(["SDE 2", "SDE 1", "Intern"]);
  });

  it("spans a stint from the oldest start to the newest end", () => {
    const [stint] = groupByCompany([
      role({ company: "HyperVerge", date: "April 2025 – December 2025", role: "SDE 2" }),
      role({ company: "HyperVerge", date: "August 2022 – June 2023", role: "Intern" })
    ]);
    expect(stint.span).toBe("August 2022 – December 2025");
  });

  it("shows a stint's location only when all its roles shared it", () => {
    const stint = (secondLocation: string) =>
      groupByCompany([
        role({ company: "HyperVerge", date: "April 2025 – December 2025", role: "SDE 2" }),
        role({
          company: "HyperVerge",
          date: "August 2022 – June 2023",
          role: "Intern",
          location: secondLocation
        })
      ])[0].location;
    expect(stint("Bangalore")).toBe("Bangalore");
    expect(stint("Toronto")).toBeNull();
  });

  it("keeps a single role's own date string as the span", () => {
    const [stint] = groupByCompany([
      role({ company: "MedMe", date: "December 2025 – Present", role: "SE II" })
    ]);
    expect(stint.span).toBe("December 2025 – Present");
  });

  it("splits a return to a former company into separate stints", () => {
    expect(groupByCompany(returning).map(g => g.company)).toEqual(["Acme", "Other", "Acme"]);
  });
});

describe("formatDuration", () => {
  it.each([
    [9, "9 mos"],
    [1, "1 mo"],
    [21, "1 yr 9 mos"],
    [24, "2 yrs"]
  ])("formats %i months as %s", (months, label) => {
    expect(formatDuration(months)).toBe(label);
  });
});

describe("totalExperienceMonths", () => {
  const now = { year: 2026, month: 9 };

  it("unions overlapping and adjacent roles instead of summing them", () => {
    expect(
      totalExperienceMonths(
        [
          "December 2025 – Present",
          "April 2025 – December 2025",
          "July 2023 – March 2025",
          "August 2022 – June 2023",
          "December 2021 – August 2022"
        ],
        now
      )
    ).toBe(58);
  });

  it("skips gaps between roles", () => {
    expect(
      totalExperienceMonths(["January 2024 – December 2024", "January 2020 – December 2020"], now)
    ).toBe(24);
  });

  it("ignores ranges it cannot read", () => {
    expect(totalExperienceMonths(["nonsense", "January 2024 – June 2024"], now)).toBe(6);
  });
});

describe("countCompanies", () => {
  it("counts a return to a former employer once", () => {
    expect(countCompanies(groupByCompany(returning))).toBe(2);
  });
});

describe("parsePeriod", () => {
  it.each([
    {
      period: "April 2025 – December 2025",
      startDate: "2025-04",
      endDate: "2025-12",
      current: false
    },
    { period: "June 2019 - April 2023", startDate: "2019-06", endDate: "2023-04", current: false },
    { period: "December 2025 – Present", startDate: "2025-12", endDate: null, current: true },
    { period: "some time ago", startDate: null, endDate: null, current: false },
    { period: "June 0999 – April 1001", startDate: "0999-06", endDate: "1001-04", current: false },
    // Unlike periodBounds, which has no use for half a range, the API keeps a parsed start.
    { period: "June 2019 – sometime", startDate: "2019-06", endDate: null, current: false }
  ])("reads $period", ({ period, startDate, endDate, current }) => {
    expect(parsePeriod(period)).toEqual({ startDate, endDate, current });
  });
});

describe("periodBounds", () => {
  it("returns numeric bounds, null for an open end, and null when either end is unreadable", () => {
    expect(periodBounds("June 2019 - April 2023")).toEqual({
      start: { year: 2019, month: 6 },
      end: { year: 2023, month: 4 }
    });
    expect(periodBounds("December 2025 – Present")).toEqual({
      start: { year: 2025, month: 12 },
      end: null
    });
    expect(periodBounds("June 2019 – sometime")).toBeNull();
  });
});
